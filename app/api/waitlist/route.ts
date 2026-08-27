import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getScheduledEvent } from '@/lib/event-schedule';
import { joinWaitlist } from '@/lib/waitlist';
import { notifyWaitlistJoined } from '@/lib/notify';
import { SPOT_TYPES } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Join an event's waitlist.
 *
 * Deliberately not the vendor application route. Nothing here signs an
 * agreement, uploads a document or touches Square, because a waitlist entry is
 * not a spot. The only thing it commits us to is contacting them in order.
 *
 * The route will only add someone to an event that is actually closed or full.
 * Waitlisting an event that is still open would leave a vendor sitting in a
 * queue when they could have just registered, so that case is rejected and the
 * page sends them to the real form instead.
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

  const event = await getScheduledEvent(eventSlug);
  if (!event || !event.isPublished) return bad('That event is not taking signups.');

  // The waitlist only exists for events you cannot apply to. If this one is
  // open, the vendor should be filling in the real form.
  if (event.isOpen) {
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
