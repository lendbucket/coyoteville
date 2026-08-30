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
    days: days.map((d) => ({
      day: d.day,
      bookable: d.bookable,
      reason: d.reason,
      eventName: d.eventName,
      eventSlug: d.eventSlug,
      boothRemaining: d.booth.remaining,
      truckRemaining: d.truck.remaining,
    })),
  });
}
