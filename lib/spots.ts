import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { NEXT_EVENT } from './seo';

/**
 * Live spot counts.
 *
 * Every number here is counted out of the database. Claimed means a row whose
 * payment has actually settled: `paid` for the ones that go through Square, and
 * `not_required` for the free Coyote organisation spots, which are confirmed
 * the moment they are submitted. Rows sitting at `unpaid` are people who
 * started checkout and have not finished, and they do not hold a spot, which is
 * the same rule the pricing copy states.
 *
 * Capacity comes from booth_capacity and truck_capacity on the events row. If
 * neither is set the snapshot reports capacityKnown false and the UI shows a
 * count with no percentage, rather than inventing a denominator.
 */

/** Payment states that mean the spot is actually held. */
const CLAIMED_STATES = ['paid', 'not_required'] as const;

export type SpotLine = {
  capacity: number | null;
  claimed: number;
  /** Null when capacity is unknown. Never negative, never above capacity. */
  remaining: number | null;
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
  const line: SpotLine = { capacity: null, claimed: 0, remaining: null };
  return {
    eventSlug,
    available: false,
    capacityKnown: false,
    booth: { ...line },
    truck: { ...line },
    total: { ...line, percent: null },
    freeClaimed: 0,
  };
}

function line(capacity: number | null, claimed: number): SpotLine {
  return {
    capacity,
    claimed,
    remaining: capacity === null ? null : Math.max(0, capacity - claimed),
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

    const [capacityResult, rowsResult] = await Promise.all([
      supabase
        .from('events')
        .select('booth_capacity, truck_capacity')
        .eq('slug', eventSlug)
        .maybeSingle(),
      supabase
        .from('vendor_applications')
        .select('spot_type')
        .eq('event_slug', eventSlug)
        .in('payment_status', CLAIMED_STATES as unknown as string[]),
    ]);

    if (rowsResult.error) throw rowsResult.error;

    const boothCapacity = capacityResult.data?.booth_capacity ?? null;
    const truckCapacity = capacityResult.data?.truck_capacity ?? null;

    let boothClaimed = 0;
    let truckClaimed = 0;
    let freeClaimed = 0;

    for (const row of rowsResult.data ?? []) {
      if (row.spot_type === 'booth') boothClaimed += 1;
      else if (row.spot_type === 'truck') truckClaimed += 1;
      else if (row.spot_type === 'free') freeClaimed += 1;
    }

    const capacityKnown = boothCapacity !== null || truckCapacity !== null;

    const totalCapacity = capacityKnown
      ? (boothCapacity ?? 0) + (truckCapacity ?? 0)
      : null;
    const totalClaimed = boothClaimed + truckClaimed;

    const totalLine = line(totalCapacity, totalClaimed);

    return {
      eventSlug,
      available: true,
      capacityKnown,
      booth: line(boothCapacity, boothClaimed),
      truck: line(truckCapacity, truckClaimed),
      total: {
        ...totalLine,
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

/** Drop the cached snapshot, so an admin edit shows up immediately. */
export function invalidateSpots(eventSlug?: string): void {
  if (eventSlug) store.delete(eventSlug);
  else store.clear();
}
