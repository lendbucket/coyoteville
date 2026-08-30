import { NextResponse } from 'next/server';
import { getDayStatuses } from '@/lib/days';
import { DAY_BOOKING_HORIZON_DAYS, addDays, isDayKey, todayKey } from '@/lib/booking';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Availability for the day picker.
 *
 * Public, because the calendar has to draw before anyone has filled anything
 * in, but it says nothing about who is booked: a vendor gets whether a date is
 * open and how many spaces are left, and nothing else. The names on those
 * bookings are staff information and stay behind the tracker.
 *
 * Rate limited because it is the one unauthenticated read that touches two
 * tables, and a calendar that is paged through quickly is indistinguishable
 * from one being scraped.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = rateLimit(`days:${ip}`, 60, 60 * 1000);

  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const url = new URL(request.url);
  const today = todayKey();
  const horizon = addDays(today, DAY_BOOKING_HORIZON_DAYS);

  const fromParam = url.searchParams.get('from') ?? '';
  const toParam = url.searchParams.get('to') ?? '';

  // Clamped to the booking window rather than rejected, so a picker that pages
  // one month past the end gets an honest answer of "none of these" instead of
  // an error it has to render around.
  const from = isDayKey(fromParam) && fromParam > today ? fromParam : today;
  const requestedTo = isDayKey(toParam) ? toParam : addDays(from, 45);
  const to = requestedTo > horizon ? horizon : requestedTo;

  if (to < from) {
    return NextResponse.json({ ok: true, from, to: from, days: [] });
  }

  const days = await getDayStatuses(from, to);

  return NextResponse.json({
    ok: true,
    from,
    to,
    horizon,
    /* Whether each type is still being taken, not how many spaces are left.
       Those are different numbers, because intake runs a small buffer past
       capacity so the review queue has something to choose between, and the
       picker's only question is whether this date can be submitted. Publishing
       the count would also tell anybody who asked exactly how full each date
       is, which is the admin's business and not a vendor's. */
    days: days.map((d) => ({
      day: d.day,
      bookable: d.bookable,
      reason: d.reason,
      eventName: d.eventName,
      eventSlug: d.eventSlug,
      boothOpen: d.bookable && d.booth.reviewRemaining > 0,
      truckOpen: d.bookable && d.truck.reviewRemaining > 0,
    })),
  });
}
