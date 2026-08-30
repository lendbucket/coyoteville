import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getScheduledEvent } from '@/lib/event-schedule';
import { joinWaitlist } from '@/lib/waitlist';
import { notifyWaitlistJoined } from '@/lib/notify';
import { SPOT_TYPES } from '@/lib/seo';
import { canBook, getDayStatus } from '@/lib/days';
import { getSpots, reviewSlotFor } from '@/lib/spots';
import { formatDayLong, isDayKey } from '@/lib/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Join an event's waitlist.
 *
 * Deliberately not the vendor application route. Nothing here signs an
 * agreement, uploads a document or touches Square, because a waitlist entry is
 * not a spot. The only thing it commits us to is contacting them in order.
 *
 * Two kinds of queue, an event or one ordinary open day, because the lot is
 * open seven days a week and a plain Tuesday can fill up on its own.
 *
 * The route only adds someone to something they cannot actually apply to, and
 * since intake is capped per spot type that is a per type question: an event
 * with booths shut and trucks open is closed to one vendor and open to the
 * next. Waitlisting somebody who could have just registered would leave them
 * sitting in a queue for no reason, so that case is rejected and the page sends
 * them to the real form instead.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Trim, collapse runs of whitespace, and cap. Same shape the form enforces. */
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  const limit = rateLimit(`waitlist:${ip}`, 6, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many tries. Give it a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad('We could not read that.');
  }

  const eventSlug = clean(body.event_slug, 120);
  const bookingDate = clean(body.booking_date, 20);
  const bookingKind = body.booking_kind === 'day' ? 'day' : 'event';
  const businessName = clean(body.business_name, 120);
  const contactName = clean(body.contact_name, 120);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 180).toLowerCase();
  const spotType = clean(body.spot_type, 20);
  const sells = clean(body.sells, 300);

  const errors: string[] = [];
  if (businessName.length < 2) errors.push('Add your business name.');
  if (contactName.length < 2) errors.push('Add a contact name.');
  if (phone.replace(/\D/g, '').length < 10) errors.push('Add a phone number we can reach you on.');
  if (!EMAIL_RE.test(email)) errors.push('That email does not look right.');
  if (!SPOT_TYPES.includes(spotType as (typeof SPOT_TYPES)[number])) {
    errors.push('Pick which kind of spot you want.');
  }
  if (sells.length < 2) errors.push('Tell us what you sell.');

  if (errors.length) return bad(errors[0]);

  /* A day queue rather than an event one. Coyoteville is open seven days a
     week, so a date can fill up on its own and there has to be somewhere for
     the next vendor to land. */
  if (bookingKind === 'day') {
    if (!isDayKey(bookingDate)) return bad('Pick a date.');

    const status = await getDayStatus(bookingDate);

    /* Only worth waiting for a date that exists and is shut. A closed day or
       an event date is not going to open up, and a date still taking
       applications should have the real form filled in instead. */
    if (status.reason === 'past' || status.reason === 'beyond-horizon') {
      return bad('That date is not one we are taking bookings for.');
    }
    if (status.reason === 'event') {
      return bad(`${formatDayLong(bookingDate)} is an event date. Use the event signup for it.`);
    }
    if (status.reason === 'closed') {
      return bad(`We are closed on ${formatDayLong(bookingDate)}, so there is no list for it.`);
    }
    if (canBook(status, spotType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `${formatDayLong(bookingDate)} is still taking applications. You can register for a spot now instead of waiting.`,
          eventOpen: true,
        },
        { status: 409 }
      );
    }

    const dayResult = await joinWaitlist({
      event_slug: null,
      booking_date: bookingDate,
      booking_kind: 'day',
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      spot_type: spotType,
      sells,
    });

    if (!dayResult.ok) return bad(dayResult.error, 503);

    // Same rule as the event path: only mail a genuinely new entry, so someone
    // who submitted twice gets no second confirmation.
    if (!dayResult.alreadyOn) {
      try {
        await notifyWaitlistJoined({
          businessName: dayResult.entry.business_name,
          contactName: dayResult.entry.contact_name,
          phone: dayResult.entry.phone,
          email: dayResult.entry.email,
          spotType: dayResult.entry.spot_type,
          sells: dayResult.entry.sells,
          position: dayResult.entry.position,
          // The date stands in for the event name, so one template reads
          // correctly for both kinds without branching on it.
          eventName: formatDayLong(bookingDate),
          eventDate: formatDayLong(bookingDate),
          eventSlug: '',
        });
      } catch (err) {
        console.error('day waitlist mail failed', err);
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyOn: dayResult.alreadyOn,
      position: dayResult.entry.position,
    });
  }

  const event = await getScheduledEvent(eventSlug);
  if (!event || !event.isPublished) return bad('That event is not taking signups.');

  /* The waitlist exists for what you cannot apply to, and since intake is
     capped per spot type that is now a per type question. An event with booths
     shut and trucks open is closed to one vendor and open to the next, so the
     type they asked for decides whether they belong here or in the form. */
  const slot = reviewSlotFor(await getSpots(event.slug), spotType);
  const openToThem = event.isOpen && slot.open;

  if (openToThem) {
    return NextResponse.json(
      {
        ok: false,
        error: 'That event is still open. You can register for a spot now instead of waiting.',
        eventOpen: true,
      },
      { status: 409 }
    );
  }

  const result = await joinWaitlist({
    event_slug: event.slug,
    booking_date: null,
    booking_kind: 'event',
    business_name: businessName,
    contact_name: contactName,
    phone,
    email,
    spot_type: spotType,
    sells,
  });

  if (!result.ok) return bad(result.error, 503);

  const { entry, alreadyOn } = result;

  // Only mail on a genuinely new entry. Someone who submitted twice should not
  // get a second confirmation, and we do not need a second alert.
  if (!alreadyOn) {
    try {
      await notifyWaitlistJoined({
        businessName: entry.business_name,
        contactName: entry.contact_name,
        phone: entry.phone,
        email: entry.email,
        spotType: entry.spot_type,
        sells: entry.sells,
        position: entry.position,
        eventName: event.name,
        eventDate: event.displayDate,
        eventSlug: event.slug,
      });
    } catch (err) {
      // Their place is already saved. Mail is not worth failing the request.
      console.error('waitlist mail failed', err);
    }
  }

  return NextResponse.json({
    ok: true,
    alreadyOn,
    position: entry.position,
    eventName: event.name,
    eventDate: event.displayDate,
  });
}
