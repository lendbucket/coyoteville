import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { EVENTS } from './seo';
import { RELEASING_STATUSES } from './approval';
import {
  DAY_BOOKING_HORIZON_DAYS,
  DAY_CAPACITY,
  addDays,
  reviewCapacity,
  reviewSlotsLeft,
  todayKey,
  type DayKey,
} from './booking';

/**
 * Availability for the ordinary open days.
 *
 * Three things decide whether a vendor may book a date:
 *
 *   It is inside the booking window, which is today through the horizon. The
 *     past is not bookable and neither is a date two years out.
 *   It is not an event date. Those go through event signup, where the deadline,
 *     the capacity meter and the waitlist all apply, and letting someone buy a
 *     day booking onto an event date would route them around all three.
 *   day_availability has not closed it, and its capacity is not used up.
 *
 * Capacity is counted the same way the event meter counts it, deliberately: a
 * settled row holds its spot while it waits on review, and a denied or
 * cancelled one releases it immediately.
 */

/**
 * One spot type on one day.
 *
 * `remaining` is physical room and is what the meter means. `reviewRemaining`
 * is how many more applications will be taken, which runs a small buffer past
 * capacity so the review queue has something to choose between. Intake is
 * gated on the second; approving is gated on the first.
 */
export type DayLine = {
  capacity: number;
  claimed: number;
  remaining: number;
  /** Unclamped pending plus approved, which the slot arithmetic runs on. */
  held: number;
  reviewCapacity: number;
  reviewRemaining: number;
};

export type DayStatus = {
  day: DayKey;
  /** False for a closed day, an event date, or one outside the window. */
  bookable: boolean;
  /** Why it cannot be booked. Null when it can. */
  reason: 'past' | 'beyond-horizon' | 'event' | 'closed' | 'full' | null;
  /** Set when the date is one of the calendar events, so the UI can link to it. */
  eventName: string | null;
  eventSlug: string | null;
  booth: DayLine;
  truck: DayLine;
  /** Admin only. Never rendered to a vendor. */
  note: string | null;
};

/**
 * One row of day_availability.
 *
 * The date column there is `booking_date`, the same name vendor_applications
 * uses, not `day`. The domain type below still calls it `day` because that is
 * what it is to the rest of the app; the translation happens where the row is
 * read, and nowhere else.
 */
type AvailabilityRow = {
  booking_date: string;
  is_open: boolean | null;
  booth_capacity: number | null;
  truck_capacity: number | null;
  note: string | null;
};

type BookingRow = {
  booking_date: string;
  spot_type: string;
};

/** Event dates, keyed by day, so a day lookup does not scan the calendar. */
function eventDays(): Map<DayKey, { slug: string; name: string }> {
  const map = new Map<DayKey, { slug: string; name: string }>();
  for (const e of EVENTS) map.set(e.date, { slug: e.slug, name: e.name });
  return map;
}

const SETTLED = ['paid', 'not_required'];

/**
 * Status for every day in a range, inclusive.
 *
 * One read of the availability exceptions and one read of the bookings for the
 * whole range, then everything is assembled in memory. A month view asks about
 * roughly thirty days and this stays two queries whether it is thirty or three
 * hundred.
 */
export async function getDayStatuses(
  from: DayKey,
  to: DayKey,
  now: number = Date.now()
): Promise<DayStatus[]> {
  const today = todayKey('America/Chicago', now);
  const horizon = addDays(today, DAY_BOOKING_HORIZON_DAYS);
  const events = eventDays();

  const exceptions = new Map<DayKey, AvailabilityRow>();
  const boothClaimed = new Map<DayKey, number>();
  const truckClaimed = new Map<DayKey, number>();
  // Permanent vendors hold their space on every day in the range, so they come
  // off capacity once rather than appearing in the per day counts.
  let monthly: MonthlyHolders = { booth: 0, truck: 0 };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();

      monthly = await getMonthlyHolders();

      const [availability, bookings] = await Promise.all([
        supabase
          .from('day_availability')
          .select('booking_date, is_open, booth_capacity, truck_capacity, note')
          .gte('booking_date', from)
          .lte('booking_date', to),
        supabase
          .from('vendor_applications')
          .select('booking_date, spot_type')
          .eq('booking_kind', 'day')
          .gte('booking_date', from)
          .lte('booking_date', to)
          .in('payment_status', SETTLED)
          .not('approval_status', 'in', `(${RELEASING_STATUSES.join(',')})`),
      ]);

      if (availability.error) throw availability.error;
      if (bookings.error) throw bookings.error;

      for (const row of (availability.data ?? []) as AvailabilityRow[]) {
        exceptions.set(row.booking_date, row);
      }

      for (const row of (bookings.data ?? []) as BookingRow[]) {
        const target = row.spot_type === 'truck' ? truckClaimed : boothClaimed;
        if (row.spot_type === 'truck' || row.spot_type === 'booth') {
          target.set(row.booking_date, (target.get(row.booking_date) ?? 0) + 1);
        }
      }
    } catch (err) {
      /* A calendar that lies about availability sells a spot that does not
         exist, so on a read failure every day comes back closed rather than
         optimistically open. */
      console.error('day availability read failed', err);
      const shut: DayLine = {
        capacity: 0,
        claimed: 0,
        remaining: 0,
        held: 0,
        reviewCapacity: 0,
        reviewRemaining: 0,
      };
      const closed: DayStatus[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        closed.push({
          day: d,
          bookable: false,
          reason: 'closed',
          eventName: null,
          eventSlug: null,
          booth: { ...shut },
          truck: { ...shut },
          note: null,
        });
      }
      return closed;
    }
  }

  const out: DayStatus[] = [];

  for (let day = from; day <= to; day = addDays(day, 1)) {
    const exception = exceptions.get(day);
    const event = events.get(day) ?? null;

    // Null means the house number; zero is a real answer and is left alone.
    const boothCapacity = exception?.booth_capacity ?? DAY_CAPACITY.booth;
    const truckCapacity = exception?.truck_capacity ?? DAY_CAPACITY.truck;

    const boothTaken = (boothClaimed.get(day) ?? 0) + monthly.booth;
    const truckTaken = (truckClaimed.get(day) ?? 0) + monthly.truck;

    const booth: DayLine = {
      capacity: boothCapacity,
      claimed: Math.min(boothTaken, boothCapacity),
      remaining: Math.max(0, boothCapacity - boothTaken),
      held: boothTaken,
      reviewCapacity: reviewCapacity(boothCapacity),
      reviewRemaining: reviewSlotsLeft(boothCapacity, boothTaken),
    };
    const truck: DayLine = {
      capacity: truckCapacity,
      claimed: Math.min(truckTaken, truckCapacity),
      remaining: Math.max(0, truckCapacity - truckTaken),
      held: truckTaken,
      reviewCapacity: reviewCapacity(truckCapacity),
      reviewRemaining: reviewSlotsLeft(truckCapacity, truckTaken),
    };

    let reason: DayStatus['reason'] = null;
    if (day < today) reason = 'past';
    else if (day > horizon) reason = 'beyond-horizon';
    else if (event) reason = 'event';
    else if (exception && exception.is_open === false) reason = 'closed';
    /* Full means nothing more is being taken, which is not the same as no room
       left. Intake runs a few past capacity so there is a queue to choose from,
       so this is measured against the review slots. */
    else if (booth.reviewRemaining === 0 && truck.reviewRemaining === 0) reason = 'full';

    out.push({
      day,
      bookable: reason === null,
      reason,
      eventName: event?.name ?? null,
      eventSlug: event?.slug ?? null,
      booth,
      truck,
      note: exception?.note ?? null,
    });
  }

  return out;
}

/** Status for one day. The API route's gate before it takes any money. */
export async function getDayStatus(day: DayKey, now: number = Date.now()): Promise<DayStatus> {
  const [status] = await getDayStatuses(day, day, now);
  return status;
}

/**
 * Whether one spot type can still be booked on a day.
 *
 * Separate from `bookable` because a day with booths left but no truck room is
 * open to one vendor and shut to another, and the calendar has to be able to
 * say which.
 */
export function canBook(status: DayStatus, spotType: string): boolean {
  if (!status.bookable) return false;
  // Review slots, not physical room: intake is what this gates.
  if (spotType === 'truck') return status.truck.reviewRemaining > 0;
  if (spotType === 'booth') return status.booth.reviewRemaining > 0;
  // Free organisation spots do not consume booth or truck capacity, the same
  // rule the event meter follows.
  return spotType === 'free';
}

/** Review slots left for one type on one day, or null for a free spot. */
export function reviewSlotsOn(status: DayStatus, spotType: string): number | null {
  if (spotType === 'truck') return status.truck.reviewRemaining;
  if (spotType === 'booth') return status.booth.reviewRemaining;
  return null;
}

/** The window the calendar draws, as day keys. */
export function bookingWindow(now: number = Date.now()): { from: DayKey; to: DayKey } {
  const from = todayKey('America/Chicago', now);
  return { from, to: addDays(from, DAY_BOOKING_HORIZON_DAYS) };
}

/* ----------------------------------------------------- permanent spots */

export type MonthlyHolders = { booth: number; truck: number };

/**
 * Permanent spots currently held.
 *
 * A monthly vendor has a space reserved every day, event days included, so they
 * come off the top of capacity everywhere rather than being counted per date.
 *
 * A pending monthly application counts, for the same reason a paid but
 * unreviewed one does on an event: the whole purpose of the count is to stop
 * more vendors being approved than there is room for, and a spot somebody is
 * about to be granted is not free. A denied or cancelled one, or a subscription
 * Square has finished cancelling, is not counted.
 */
export async function getMonthlyHolders(): Promise<MonthlyHolders> {
  if (!isSupabaseConfigured()) return { booth: 0, truck: 0 };

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('vendor_applications')
      .select('spot_type, subscription_status')
      .eq('booking_kind', 'monthly')
      .not('approval_status', 'in', `(${RELEASING_STATUSES.join(',')})`);

    if (error) throw error;

    const holders: MonthlyHolders = { booth: 0, truck: 0 };

    for (const row of (data ?? []) as { spot_type: string; subscription_status: string | null }[]) {
      // A subscription Square has finished cancelling has given the spot back.
      // One that is merely cancelling at period end has not: that vendor is
      // still setting up until the date they are paid through.
      if (row.subscription_status === 'canceled') continue;
      if (row.spot_type === 'booth') holders.booth += 1;
      else if (row.spot_type === 'truck') holders.truck += 1;
    }

    return holders;
  } catch (err) {
    /* Reporting zero would let the lot be oversold. Reporting the full house
       number blocks new monthly signups until the read works again, which is
       the safe direction to fail in. */
    console.error('monthly holder count failed', err);
    return { booth: DAY_CAPACITY.booth, truck: DAY_CAPACITY.truck };
  }
}

/** Whether one more permanent spot of a type can be sold. */
export async function monthlyRoomFor(
  spotType: string
): Promise<{ available: boolean; held: number; capacity: number }> {
  const holders = await getMonthlyHolders();

  const capacity = spotType === 'truck' ? DAY_CAPACITY.truck : DAY_CAPACITY.booth;
  const held = spotType === 'truck' ? holders.truck : holders.booth;

  /* Permanent spots are capped well below the lot, not at it. Selling every
     space on the lot as permanent would leave nothing for the food trucks who
     turn up for one Friday, which is most of them and the reason there is a
     crowd for a permanent vendor to sell to. A third is the share that keeps
     both sides of that worth having. */
  const permanentCap = Math.max(1, Math.floor(capacity / 3));

  return { available: held < permanentCap, held, capacity: permanentCap };
}
