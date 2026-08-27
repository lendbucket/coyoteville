import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getScheduledEvent } from '@/lib/event-schedule';
import { getEntry, markOffered } from '@/lib/waitlist';
import { sendWaitlistOffer } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Offer one waitlisted vendor a spot.
 *
 * Order matters here. The email goes first and the row is only stamped once
 * the provider accepted it, so "offered" in the tracker means they were
 * actually contacted. Stamping first and mailing second would leave a vendor
 * marked as invited, and therefore skipped, after a bounce.
 *
 * Which spot type they are offered is whatever they asked for. Offering a
 * booth vendor a truck spot is a conversation, not a button.
 */

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return bad('Not signed in.', 401);
  }

  let id = '';
  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === 'string' ? body.id : '';
  } catch {
    return bad('We could not read that.');
  }

  if (!id) return bad('Which waitlist entry?');

  const entry = await getEntry(id);
  if (!entry) return bad('That waitlist entry is gone.', 404);

  if (entry.status === 'converted') {
    return bad('That vendor already registered.', 409);
  }

  const event = await getScheduledEvent(entry.event_slug);
  if (!event) return bad('That event is not in the calendar.', 409);

  const sent = await sendWaitlistOffer({
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

  if (!sent.ok) {
    return bad(sent.error ?? 'The offer email could not be sent. Nothing was changed.', 502);
  }

  const stamped = await markOffered(entry.id);

  if (!stamped) {
    // The vendor has the email. Say so plainly rather than implying nothing
    // happened, because sending it a second time would confuse them.
    return NextResponse.json(
      {
        ok: true,
        warning:
          'The offer was emailed, but the tracker could not be updated. Mark it by hand so they are not contacted twice.',
        email: entry.email,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, email: entry.email });
}
