import { PRICING } from './seo';

/**
 * What a vendor is buying.
 *
 * Three kinds, one table, one review queue:
 *
 *   'event'   one of the dates on the calendar. Deadlines and the waitlist
 *             apply, and the fee is the ordinary spot price.
 *   'day'     any other open day. Coyoteville is open seven days a week, so
 *             most of the year is bookable without an event on it. Same price
 *             as an event day, because it is the same space.
 *   'monthly' a permanent spot on a recurring Square subscription, billed every
 *             month until it is cancelled.
 *
 * No 'server-only' import: the form, the tracker and the email templates all
 * read from here.
 */

export const BOOKING_KINDS = ['event', 'day', 'monthly'] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export function isBookingKind(value: unknown): value is BookingKind {
  return BOOKING_KINDS.includes(value as BookingKind);
}

export const BOOKING_LABELS: Record<BookingKind, string> = {
  event: 'Event date',
  day: 'Single day',
  monthly: 'Permanent monthly spot',
};

/* ------------------------------------------------------- daily capacity */

/**
 * The house numbers for an ordinary day.
 *
 * Deliberately the same as the seeded event capacity: it is the same lot with
 * the same room in it, and a day that needs different numbers gets a row in
 * day_availability rather than a second set of constants here.
 */
export const DAY_CAPACITY = {
  booth: 20,
  truck: 14,
} as const;

/**
 * How far ahead a vendor can book an ordinary day, and how far ahead the
 * calendar is drawn. Long enough to plan a season around, short enough that
 * nobody books a date the lot may not exist in its current form for.
 */
export const DAY_BOOKING_HORIZON_DAYS = 120;

/* -------------------------------------------------------------- monthly */

/**
 * The permanent spot.
 *
 * Priced per month, not per day. A truck at $600 works out well under the daily
 * rate if they turn up even half the month, which is the argument the promo
 * section makes, and it is stated in the same place the fee is defined so the
 * two cannot drift.
 */
export const MONTHLY_PRICING = {
  booth: { cents: 35000, price: '$350', label: 'Permanent Booth' },
  truck: { cents: 60000, price: '$600', label: 'Permanent Food Truck Spot' },
} as const;

export type MonthlySpot = keyof typeof MONTHLY_PRICING;

export function isMonthlySpot(value: unknown): value is MonthlySpot {
  return value === 'booth' || value === 'truck';
}

/** Monthly fee in cents, or null for a spot type that has no monthly option. */
export function monthlyPriceFor(spot: string): number | null {
  return isMonthlySpot(spot) ? MONTHLY_PRICING[spot].cents : null;
}

/**
 * What a booking costs, in cents.
 *
 * A day booking costs the same as an event booking: the space, the power
 * situation and the clean up are identical, and charging less for a quiet
 * Tuesday would only teach people to wait for one.
 */
export function priceForBooking(kind: BookingKind, spot: string): number | null {
  if (kind === 'monthly') return monthlyPriceFor(spot);
  if (spot === 'booth') return PRICING.booth.cents;
  if (spot === 'truck') return PRICING.truck.cents;
  if (spot === 'free') return 0;
  return null;
}

/* ------------------------------------------------------------ dates */

/**
 * A date as YYYY-MM-DD in the park's own timezone.
 *
 * Everything to do with a booking day is handled as this string rather than as
 * a Date. A Date is an instant, and an instant is the wrong type for "Tuesday":
 * parsing '2026-09-11' gives midnight UTC, which in Alice is the evening of the
 * tenth, and that one hour is how a calendar ends up off by a day for everybody
 * west of Greenwich.
 */
export type DayKey = string;

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === 'string' && DAY_KEY_RE.test(value);
}

/** Today in the park's timezone, as a day key. */
export function todayKey(timeZone = 'America/Chicago', now: number = Date.now()): DayKey {
  // en-CA formats as YYYY-MM-DD, which is the shape wanted, and asking for it
  // in the target zone is what makes the answer the park's today rather than
  // the server's.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/** Add whole days to a day key without going anywhere near local time. */
export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  // Built and read in UTC on both sides, so no zone ever enters the arithmetic.
  const at = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const next = new Date(at);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate()
  ).padStart(2, '0')}`;
}

/** 0 for Sunday through 6 for Saturday, computed in UTC. */
export function weekdayOf(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function asUtcDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Friday, September 11, 2026". Formatted in UTC to match how it was built. */
export function formatDayLong(key: DayKey): string {
  return LONG_DATE.format(asUtcDate(key));
}

/** "Fri, Sep 11". For a calendar cell or a tracker row. */
export function formatDayShort(key: DayKey): string {
  return SHORT_DATE.format(asUtcDate(key));
}

/** The first of the month a day key falls in. */
export function monthStart(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

/** "September 2026". */
export function formatMonth(key: DayKey): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(asUtcDate(key));
}

/** How many days the month containing this key has. */
export function daysInMonth(key: DayKey): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * A month on from a day key, clamped to the end of the shorter month.
 *
 * Square bills a monthly subscription on the same day number each month and
 * falls back to the last day when that number does not exist, so a spot started
 * on the 31st renews on the 30th of a thirty day month. Reproduced here so the
 * next charge date shown to the vendor is the one they will actually be
 * charged on.
 */
export function addMonth(key: DayKey): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  const targetYear = m === 12 ? y + 1 : y;
  const targetMonth = m === 12 ? 1 : m + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
