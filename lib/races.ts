import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { RACE_SLUG, type RaceClock } from './race';

/**
 * The races table, read.
 *
 * Everything the Turkey Trot page says about dates, capacity and deadlines
 * comes from here. Nothing about a race is a constant in the code, for the same
 * reason events.starts_at is not: the one time a date was written into a file
 * it was wrong inside a week, and it was wrong on a page somebody had already
 * shared.
 */

export type Race = {
  slug: string;
  name: string;
  startsAtISO: string;
  displayDate: string;
  displayTime: string;
  distanceLabel: string;
  courseCertified: boolean;
  chipTimed: boolean;
  locationName: string;
  locationAddress: string;
  registrationOpensAtISO: string | null;
  registrationClosesAtISO: string;
  shirtDeadlineAtISO: string;
  packetPickup: string;
  runnerCapacity: number;
  isPublished: boolean;
  waiverVersion: string;
};

const COLUMNS =
  'slug, name, starts_at, display_date, display_time, distance_label, ' +
  'course_certified, chip_timed, location_name, location_address, ' +
  'registration_opens_at, registration_closes_at, shirt_deadline_at, ' +
  'packet_pickup, runner_capacity, is_published, waiver_version';

type Row = {
  slug: string;
  name: string;
  starts_at: string;
  display_date: string;
  display_time: string;
  distance_label: string | null;
  course_certified: boolean | null;
  chip_timed: boolean | null;
  location_name: string | null;
  location_address: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string;
  shirt_deadline_at: string;
  packet_pickup: string | null;
  runner_capacity: number | null;
  is_published: boolean | null;
  waiver_version: string | null;
};

function toRace(row: Row): Race {
  return {
    slug: row.slug,
    name: row.name,
    startsAtISO: row.starts_at,
    displayDate: row.display_date,
    displayTime: row.display_time,
    distanceLabel: row.distance_label ?? 'approximately 3.1 miles',
    /* Both default false rather than true. A page that promises a certified
       course or chip times because a column was null would be making a claim
       nobody made, and the honest default for a promise is "no". */
    courseCertified: row.course_certified === true,
    chipTimed: row.chip_timed === true,
    locationName: row.location_name ?? 'Coyoteville',
    locationAddress: row.location_address ?? '150 N. Stadium Road, Alice, TX 78332',
    registrationOpensAtISO: row.registration_opens_at,
    registrationClosesAtISO: row.registration_closes_at,
    shirtDeadlineAtISO: row.shirt_deadline_at,
    packetPickup: row.packet_pickup ?? '',
    runnerCapacity: Math.max(0, row.runner_capacity ?? 0),
    isPublished: row.is_published === true,
    waiverVersion: row.waiver_version ?? '',
  };
}

/** One race by slug, or null. Cached per request. */
export const getRace = cache(async (slug: string = RACE_SLUG): Promise<Race | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('races')
      .select(COLUMNS)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return toRace(data as unknown as Row);
  } catch (err) {
    console.error('could not read the race', slug, err);
    return null;
  }
});

/** The clock the pricing rules read. Built from the row, never from a literal. */
export function clockFor(race: Race): RaceClock {
  return {
    startsAtMs: Date.parse(race.startsAtISO),
    shirtDeadlineMs: Date.parse(race.shirtDeadlineAtISO),
    registrationClosesMs: Date.parse(race.registrationClosesAtISO),
    registrationOpensMs: race.registrationOpensAtISO
      ? Date.parse(race.registrationOpensAtISO)
      : null,
  };
}

/* ------------------------------------------------------------- the field */

export type RaceCounts = {
  /** Runners holding a place: everything not refunded. */
  taken: number;
  capacity: number;
  remaining: number;
  full: boolean;
};

/**
 * How full the race is.
 *
 * Counts every registration that is not refunded, paid or not. An unpaid row is
 * somebody part way through checkout and their place is theirs while they
 * finish; a refunded row gave its place back. This is deliberately not the
 * thirty minute rule the vendor spots use: a race field of four hundred does
 * not need a holding window, and a runner who abandons checkout is a place that
 * comes back when the row is refunded or cleaned up rather than on a timer.
 */
export async function getRaceCounts(race: Race): Promise<RaceCounts> {
  const capacity = race.runnerCapacity;
  const empty: RaceCounts = { taken: 0, capacity, remaining: capacity, full: false };

  if (!isSupabaseConfigured()) return empty;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('race_registrations')
      .select('payment_status')
      .eq('race_slug', race.slug);

    if (error) throw error;

    const taken = ((data ?? []) as { payment_status: string | null }[]).filter(
      (r) => (r.payment_status ?? 'unpaid') !== 'refunded'
    ).length;

    return {
      taken,
      capacity,
      remaining: Math.max(0, capacity - taken),
      /* A capacity of zero is "no limit set", not "full". Same rule the vendor
         meter follows: refusing everybody because nobody set a number turns a
         missing config value into a race with no runners. */
      full: capacity > 0 && taken >= capacity,
    };
  } catch (err) {
    console.error('could not count the field', race.slug, err);
    return empty;
  }
}

/* ---------------------------------------------------------- the sponsors */

export type PublishedSponsor = {
  id: string;
  level: string;
  businessName: string;
  website: string | null;
  logoPath: string | null;
};

/**
 * Sponsors Robert has published, for the page.
 *
 * Published rather than paid: paying is between the sponsor and Square, and
 * putting a logo on a public page is a decision Robert makes in the tracker.
 * The two are separate on purpose.
 */
export async function getPublishedSponsors(raceSlug: string): Promise<PublishedSponsor[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('race_sponsors')
      .select('id, level, business_name, website, logo_path, published_at, amount_cents')
      .eq('race_slug', raceSlug)
      .not('published_at', 'is', null)
      .order('amount_cents', { ascending: false });

    if (error) throw error;

    return ((data ?? []) as unknown as {
      id: string;
      level: string;
      business_name: string;
      website: string | null;
      logo_path: string | null;
    }[]).map((row) => ({
      id: row.id,
      level: row.level,
      businessName: row.business_name,
      website: row.website,
      logoPath: row.logo_path,
    }));
  } catch (err) {
    console.error('could not read the sponsors', raceSlug, err);
    return [];
  }
}
