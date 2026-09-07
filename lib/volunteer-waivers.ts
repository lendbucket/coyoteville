import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { VOLUNTEER_MINIMUM } from './parking-fundraiser';

/**
 * Signed volunteer waivers, read for the tracker.
 *
 * The count is the thing. On the night, before parking opens, Robert needs one
 * number: how many adults from this organization have actually signed, against
 * the six they promised. That number decides whether the forfeit in section 4
 * of the program terms applies, so it has to be a count of signatures in the
 * database and not a count of people somebody thinks they saw.
 *
 * Minors are counted separately and never folded in. A minor who has signed is
 * a real volunteer with a real waiver, and is also explicitly not one of the
 * six, so a single total would answer the wrong question in the one moment the
 * question matters.
 */

export type WaiverRow = {
  id: string;
  event_slug: string;
  org_application_id: string | null;
  full_name: string;
  phone: string | null;
  is_adult: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  waiver_version: string;
  signature_name: string;
  signed_at: string;
};

const COLUMNS =
  'id, event_slug, org_application_id, full_name, phone, is_adult, guardian_name, ' +
  'guardian_phone, emergency_contact_name, emergency_contact_phone, waiver_version, ' +
  'signature_name, signed_at';

/** One event's signed waivers, oldest first, which is the order they arrived. */
export type EventWaivers = {
  eventSlug: string;
  adults: WaiverRow[];
  minors: WaiverRow[];
  /** Adults still needed to clear the minimum. Zero once it is met. */
  short: number;
  /** True once the adult count has reached the minimum. */
  met: boolean;
  minimum: number;
};

function summarise(eventSlug: string, rows: WaiverRow[]): EventWaivers {
  const adults = rows.filter((r) => r.is_adult);
  const minors = rows.filter((r) => !r.is_adult);
  return {
    eventSlug,
    adults,
    minors,
    short: Math.max(0, VOLUNTEER_MINIMUM - adults.length),
    met: adults.length >= VOLUNTEER_MINIMUM,
    minimum: VOLUNTEER_MINIMUM,
  };
}

export function emptyWaivers(eventSlug: string): EventWaivers {
  return summarise(eventSlug, []);
}

/**
 * Waivers for several events in one query.
 *
 * The tracker lists every upcoming game with its own count, so this takes the
 * whole set rather than being called once per game. Four games is four rows in
 * a panel and would otherwise be four round trips on every tracker load.
 */
export async function getWaiversForEvents(
  eventSlugs: readonly string[]
): Promise<Record<string, EventWaivers>> {
  const out: Record<string, EventWaivers> = {};
  for (const slug of eventSlugs) out[slug] = emptyWaivers(slug);

  if (!eventSlugs.length || !isSupabaseConfigured()) return out;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('volunteer_waivers')
      .select(COLUMNS)
      .in('event_slug', eventSlugs)
      .order('signed_at', { ascending: true });

    if (error) throw error;

    const byEvent = new Map<string, WaiverRow[]>();
    for (const row of (data ?? []) as unknown as WaiverRow[]) {
      const list = byEvent.get(row.event_slug) ?? [];
      list.push(row);
      byEvent.set(row.event_slug, list);
    }

    for (const slug of eventSlugs) out[slug] = summarise(slug, byEvent.get(slug) ?? []);
    return out;
  } catch (err) {
    /* Zero is the honest answer to a failed read here and it is also the
       alarming one, which is the right direction: a panel showing nobody signed
       sends Robert to look, and a panel inventing a number does not. */
    console.error('could not read volunteer waivers', err);
    return out;
  }
}
