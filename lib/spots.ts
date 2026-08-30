import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { NEXT_EVENT } from './seo';
import { RELEASING_STATUSES } from './approval';
import { getMonthlyHolders } from './days';
import { reviewCapacity, reviewSlotsLeft } from './booking';

/**
 * Live spot counts.
 *
 * Website applications are counted out of the database. Claimed means a row
 * whose payment has actually settled: 'paid' for the ones that go through
 * Square, and 'not_required' for the free Alice organisation spots. Rows
 * sitting at 'unpaid' are people who started checkout and have not finished,
 * and they do not hold a spot, which is the same rule the pricing copy states.
 *
 * A settled row holds its spot while it waits on review. That is deliberate:
 * approving more vendors than there is room for is the failure this meter
 * exists to prevent, so a paid application that nobody has looked at yet still
 * counts against capacity. Denying or cancelling one releases it immediately,
 * before any refund has settled, because the spot is free the moment the
 * decision is made and the next vendor should be able to have it.
 *
 * On top of that, booth_claimed_offline and truck_claimed_offline on the events
 * row hold vendors who committed by phone or on Facebook rather than through
 * the form. Claimed for a type is the website count plus that number.
 *
 * IMPORTANT: decrement the offline count when one of those vendors later
 * registers through the site. Their application starts counting on its own at
 * that point, and leaving the offline number alone counts them twice and shows
 * the event fuller than it is.
 *
 * Capacity comes from booth_capacity and truck_capacity. If neither is set the
 * snapshot reports capacityKnown false and the UI shows a count with no
 * percentage, rather than inventing a denominator.
 */

/** Payment states that mean the spot is actually held. */
const CLAIMED_STATES = ['paid', 'not_required'] as const;

/** Decisions that hand the spot back, whatever the payment status says. */
const RELEASED_STATES = RELEASING_STATUSES;

export type SpotLine = {
  capacity: number | null;
  /**
   * Website applications plus the offline count, clamped to capacity so the
   * page never reads "22 of 20 claimed" when an offline number is stale.
   */
  claimed: number;
  /** The offline portion of the claimed figure, for reconciling the numbers. */
  offline: number;
  /** Null when capacity is unknown. Never negative, never above capacity. */
  remaining: number | null;
  /**
   * The unclamped count, which is what the review slot arithmetic runs on.
   * `claimed` is clamped for display and would quietly hide an oversubscription
   * from the very calculation that exists to prevent one.
   */
  held: number;
  /** capacity + the buffer. Null when capacity is unknown. */
  reviewCapacity: number | null;
  /**
   * How many more applications of this type will be accepted before signup
   * shuts and sends people to the waitlist. Null when capacity is unknown, in
   * which case nothing is capped because there is no number to cap against.
   */
  reviewRemaining: number | null;
};

export type SpotsSnapshot = {
  eventSlug: string;
  /** False when Supabase is unreachable or unconfigured. */
  available: boolean;
  /** False when no capacity is set on the event row. */
  capacityKnown: boolean;
  booth: SpotLine;
  truck: SpotLine;
  total: SpotLine & {
    /** 0-100, rounded. Null when capacity is unknown. */
    percent: number | null;
  };
  /** Free organisation spots are counted but do not consume booth or truck capacity. */
  freeClaimed: number;
};

function emptySnapshot(eventSlug: string): SpotsSnapshot {
  const blank: SpotLine = {
    capacity: null,
    claimed: 0,
    offline: 0,
    remaining: null,
    held: 0,
    reviewCapacity: null,
    reviewRemaining: null,
  };
  return {
    eventSlug,
    available: false,
    capacityKnown: false,
    booth: { ...blank },
    truck: { ...blank },
    total: { ...blank, percent: null },
    freeClaimed: 0,
  };
}

function line(capacity: number | null, website: number, offline: number): SpotLine {
  // A negative offline number is a data entry slip, not a credit against real
  // applications, so it floors at zero.
  const offlineCount = Math.max(0, offline);
  const total = website + offlineCount;

  return {
    capacity,
    claimed: capacity === null ? total : Math.min(total, capacity),
    offline: offlineCount,
    remaining: capacity === null ? null : Math.max(0, capacity - total),
    held: total,
    reviewCapacity: capacity === null ? null : reviewCapacity(capacity),
    reviewRemaining: capacity === null ? null : reviewSlotsLeft(capacity, total),
  };
}

/* ----------------------------------------------------------- event row */

type EventCounts = {
  boothCapacity: number | null;
  truckCapacity: number | null;
  boothOffline: number;
  truckOffline: number;
};

const WITH_OFFLINE =
  'booth_capacity, truck_capacity, booth_claimed_offline, truck_claimed_offline';
const WITHOUT_OFFLINE = 'booth_capacity, truck_capacity';

/**
 * Whether the offline columns exist. Null until the first query answers it.
 * Remembered so a database that predates them costs one failed query per
 * process rather than one per snapshot.
 */
let offlineColumnsPresent: boolean | null = null;

/** PostgREST reports an unknown column as 42703. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message ?? '');
}

/**
 * Read capacity and the offline counts for an event.
 *
 * On a database that has not had the offline columns added yet the wide select
 * fails, and this falls back to the original two columns and treats offline as
 * zero rather than erroring the whole snapshot.
 */
async function fetchEventCounts(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventSlug: string
): Promise<EventCounts> {
  const empty: EventCounts = {
    boothCapacity: null,
    truckCapacity: null,
    boothOffline: 0,
    truckOffline: 0,
  };

  if (offlineColumnsPresent !== false) {
    const { data, error } = await supabase
      .from('events')
      .select(WITH_OFFLINE)
      .eq('slug', eventSlug)
      .maybeSingle();

    if (!error) {
      offlineColumnsPresent = true;
      return {
        boothCapacity: data?.booth_capacity ?? null,
        truckCapacity: data?.truck_capacity ?? null,
        boothOffline: data?.booth_claimed_offline ?? 0,
        truckOffline: data?.truck_claimed_offline ?? 0,
      };
    }

    if (!isMissingColumn(error)) {
      // A real failure. Capacity stays unknown and the UI shows the neutral
      // state instead of a percentage of nothing.
      console.error('event capacity read failed', error);
      return empty;
    }

    offlineColumnsPresent = false;
    console.warn(
      'events.booth_claimed_offline / truck_claimed_offline are missing; treating offline counts as 0'
    );
  }

  const { data, error } = await supabase
    .from('events')
    .select(WITHOUT_OFFLINE)
    .eq('slug', eventSlug)
    .maybeSingle();

  if (error) {
    console.error('event capacity read failed', error);
    return empty;
  }

  return {
    boothCapacity: data?.booth_capacity ?? null,
    truckCapacity: data?.truck_capacity ?? null,
    boothOffline: 0,
    truckOffline: 0,
  };
}

/* --------------------------------------------------------------- caching */

/**
 * Short lived process cache so a burst of requests, or several components on
 * one page, do not each hit the database. The page itself is also revalidated
 * on an interval, so in practice this is the second of two guards.
 */
const TTL_MS = 30_000;

type Entry = { at: number; value: SpotsSnapshot };
const store = new Map<string, Entry>();

async function loadSnapshot(eventSlug: string): Promise<SpotsSnapshot> {
  if (!isSupabaseConfigured()) return emptySnapshot(eventSlug);

  try {
    const supabase = getSupabaseAdmin();

    const [counts, rowsResult, monthly] = await Promise.all([
      fetchEventCounts(supabase, eventSlug),
      supabase
        .from('vendor_applications')
        .select('spot_type')
        .eq('event_slug', eventSlug)
        .in('payment_status', CLAIMED_STATES as unknown as string[])
        .not('approval_status', 'in', `(${RELEASED_STATES.join(',')})`),
      /* Permanent vendors are included in every event at no extra charge, so
         their space is already spoken for on an event night and has to come off
         the top here as well as off the daily calendar. Without this the event
         meter would offer room that a monthly vendor is standing in. */
      getMonthlyHolders(),
    ]);

    if (rowsResult.error) throw rowsResult.error;

    let boothWebsite = 0;
    let truckWebsite = 0;
    let freeClaimed = 0;

    for (const row of rowsResult.data ?? []) {
      if (row.spot_type === 'booth') boothWebsite += 1;
      else if (row.spot_type === 'truck') truckWebsite += 1;
      else if (row.spot_type === 'free') freeClaimed += 1;
    }

    // Monthly holders ride in alongside the offline count: both are vendors
    // holding a space who did not book this event through the form.
    const booth = line(counts.boothCapacity, boothWebsite, counts.boothOffline + monthly.booth);
    const truck = line(counts.truckCapacity, truckWebsite, counts.truckOffline + monthly.truck);

    const capacityKnown = counts.boothCapacity !== null || counts.truckCapacity !== null;

    const totalCapacity = capacityKnown
      ? (counts.boothCapacity ?? 0) + (counts.truckCapacity ?? 0)
      : null;

    // Each type is clamped to its own capacity first, so a booth overshoot
    // cannot be hidden by trucks having room to spare.
    const totalClaimed = booth.claimed + truck.claimed;

    return {
      eventSlug,
      available: true,
      capacityKnown,
      booth,
      truck,
      total: {
        capacity: totalCapacity,
        claimed: totalClaimed,
        offline: booth.offline + truck.offline,
        remaining: totalCapacity === null ? null : Math.max(0, totalCapacity - totalClaimed),
        held: booth.held + truck.held,
        /* The two per type caps added together, not the buffer applied once to
           the combined capacity. The buffer is per type per date, so a lot with
           twenty booths and fourteen trucks has two separate five slot queues
           and not one of five. */
        reviewCapacity:
          booth.reviewCapacity === null && truck.reviewCapacity === null
            ? null
            : (booth.reviewCapacity ?? 0) + (truck.reviewCapacity ?? 0),
        /* The pair, not the sum against a combined cap. A vendor is refused on
           the type they asked for, so an event with booths spare and no truck
           room has slots left and is not full. */
        reviewRemaining:
          booth.reviewRemaining === null && truck.reviewRemaining === null
            ? null
            : (booth.reviewRemaining ?? 0) + (truck.reviewRemaining ?? 0),
        percent:
          totalCapacity && totalCapacity > 0
            ? Math.min(100, Math.round((totalClaimed / totalCapacity) * 100))
            : totalCapacity === 0
              ? 100
              : null,
      },
      freeClaimed,
    };
  } catch (err) {
    // A dashboard that lies is worse than one that admits it cannot count.
    console.error('spot count failed', err);
    return emptySnapshot(eventSlug);
  }
}

/**
 * Cached snapshot. `cache` dedupes within a single render pass, the TTL map
 * dedupes across requests on the same instance.
 */
export const getSpots = cache(
  async (eventSlug: string = NEXT_EVENT.slug): Promise<SpotsSnapshot> => {
    const hit = store.get(eventSlug);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const value = await loadSnapshot(eventSlug);
    store.set(eventSlug, { at: Date.now(), value });
    return value;
  }
);

/**
 * Whether one more application of a type will be accepted for an event.
 *
 * Per type, because a vendor is refused on the type they asked for. An event
 * with booths spare and no truck room is open to one and shut to the other,
 * and refusing both would send away business we have space for.
 *
 * Free organisation spots consume no booth or truck capacity, so nothing caps
 * them here, the same rule the meter follows.
 */
export function reviewSlotFor(
  spots: SpotsSnapshot,
  spotType: string
): { open: boolean; remaining: number | null } {
  if (spotType === 'free') return { open: true, remaining: null };

  const line = spotType === 'truck' ? spots.truck : spots.booth;

  // No capacity set means no number to cap against, so nothing is refused.
  if (line.reviewRemaining === null) return { open: true, remaining: null };

  return { open: line.reviewRemaining > 0, remaining: line.reviewRemaining };
}

/** Drop the cached snapshot, so an admin edit shows up immediately. */
export function invalidateSpots(eventSlug?: string): void {
  if (eventSlug) store.delete(eventSlug);
  else store.clear();
}
