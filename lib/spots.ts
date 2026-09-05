import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { nextEventByDate } from './seo';
import { getMonthlyHolders } from './days';
import { reviewCapacity, reviewSlotsLeft } from './booking';
import { HEALTHCHECK_BUSINESS_NAME } from './healthcheck';

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
 * booth_claimed_offline and truck_claimed_offline are deliberately NOT part of
 * this. They were a manual tally of vendors who committed by phone or on
 * Facebook, added on top of the row count, and every offline vendor who then
 * registered through the prepaid link both inserted a row and decremented the
 * tally. The two halves of that only stayed in step by hand, and they did not:
 * the meter was counting the same vendors twice. Taken is the rows, and only
 * the rows.
 *
 * Capacity comes from booth_capacity and truck_capacity, plainly. Not capacity
 * plus the review buffer: the buffer decides how many applications are accepted
 * before signup shuts, which is a different question from how many spots exist,
 * and showing it as the denominator told the admin the lot was bigger than it
 * is. If neither capacity is set the snapshot reports capacityKnown false and
 * the UI shows a count with no percentage rather than inventing a denominator.
 */

/**
 * The one decision that hands a spot back.
 *
 * Everything else counts, including a row still waiting on review and a row
 * whose checkout was never finished. A spot is taken until it is refused.
 *
 * Named rather than inlined because it is the whole capacity rule: widening or
 * narrowing what releases a spot is a one line change here and nowhere else.
 */
const RELEASES_SPOT = 'denied';

/**
 * Whether a free Alice organisation spot consumes a booth.
 *
 * It does. An org sets up in a booth footprint, so a lot with twenty two booths
 * and two orgs has twenty left to sell. Counting them separately made the meter
 * offer room that is physically occupied, which is the one failure this meter
 * exists to prevent.
 *
 * They are still reported on their own as freeClaimed, so the split is visible
 * and this is one constant to flip if the orgs turn out to stand somewhere that
 * is not a booth.
 */
const FREE_CONSUMES_BOOTH = true;

export type SpotLine = {
  capacity: number | null;
  /**
   * Website applications plus the offline count, clamped to capacity so the
   * page never reads "22 of 20 claimed" when an offline number is stale.
   */
  claimed: number;
  /**
   * The part of the claimed figure that is not this event's own rows: the
   * permanent monthly vendors. Kept separate so the meter can be reconciled
   * against a plain count of the event's applications.
   */
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

/**
 * One spot type.
 *
 * `alsoHolding` is the permanent monthly vendors. They hold a space at every
 * event by definition and carry no event_slug of their own, so they are not in
 * the event's rows and have to be added here or the meter offers room somebody
 * is standing in. It is not the old offline tally, which is gone.
 */
function line(capacity: number | null, website: number, alsoHolding: number): SpotLine {
  const offlineCount = Math.max(0, alsoHolding);
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
        /* Read and deliberately discarded. The capacity meter no longer
           counts them; see the note at the top of this file. They are left in
           the select so the column-missing fallback below keeps working on a
           database that predates them. */
        boothOffline: 0,
        truckOffline: 0,
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
      /* Every row for the event that has not been refused. Payment status is
         deliberately not filtered on: an unfinished checkout is still holding
         the spot it picked until somebody denies it. */
      supabase
        .from('vendor_applications')
        .select('spot_type')
        .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
        .eq('event_slug', eventSlug)
        .neq('approval_status', RELEASES_SPOT),
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

    const boothTaken = boothWebsite + (FREE_CONSUMES_BOOTH ? freeClaimed : 0);

    const booth = line(counts.boothCapacity, boothTaken, monthly.booth);
    const truck = line(counts.truckCapacity, truckWebsite, monthly.truck);

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
 *
 * That second cache is a process-level Map, so it outlives a request and no
 * amount of route configuration reaches it: force-dynamic re-renders the page
 * and this still hands back a snapshot up to thirty seconds old. Fine for the
 * public meter, wrong for the tracker, which is why getSpotsFresh exists.
 */
export const getSpots = cache(
  async (eventSlug: string = nextEventByDate().slug): Promise<SpotsSnapshot> => {
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
/**
 * The same snapshot, counted now.
 *
 * For the tracker, where a stale number is a decision made on the wrong facts.
 * It still fills the shared cache, so a public request arriving just after gets
 * the fresh figure rather than starting another count.
 */
export async function getSpotsFresh(eventSlug: string): Promise<SpotsSnapshot> {
  const value = await loadSnapshot(eventSlug);
  store.set(eventSlug, { at: Date.now(), value });
  return value;
}

export function invalidateSpots(eventSlug?: string): void {
  if (eventSlug) store.delete(eventSlug);
  else store.clear();
}
