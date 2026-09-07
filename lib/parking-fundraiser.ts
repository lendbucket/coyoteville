import 'server-only';
import { randomInt } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { getEvents } from './events-source';
import { endsAtMs } from './events-source';
import type { EventConfig } from './seo';

/**
 * The Parking Fundraiser.
 *
 * Half the gross parking from each home game goes to one Alice organization,
 * which works the event in return. One org per game, drawn at random from the
 * eligible applicants.
 *
 * The name is one constant because Robert may rename it, and a rename should be
 * one edit rather than a search across a page, two emails, a form and a set of
 * terms. It was renamed once already, from Friday Night Fund to match the
 * printed flyer, and that turned out to be one line here plus the route.
 */

/** Working name. Change here and it changes everywhere. */
export const PROGRAM_NAME = 'Parking Fundraiser';

/* ------------------------------------------------------------- the flyer */

/**
 * Whether the printed flyer is in the repo yet.
 *
 * A plain constant rather than a check for the file on disk, and the reason is
 * where this code runs. The page revalidates on a serverless function whose
 * filesystem does not necessarily carry public/, so an existsSync here would
 * answer true at build and false on the first revalidation, and the flyer would
 * quietly vanish from a page that had it a minute ago. One boolean cannot do
 * that.
 *
 * Flip this to true in the same commit that adds
 * public/photos/parking-fundraiser.png, and set the two dimensions below to the
 * real ones. scripts/make-flyer-og.js prints all three lines ready to paste,
 * and produces the landscape crop the social card uses.
 */
export const FLYER_AVAILABLE = false;

/** The flyer's real pixel dimensions. Wrong values shift the layout on load. */
export const FLYER_WIDTH = 0;
export const FLYER_HEIGHT = 0;

/** The portrait flyer, and the 1200x630 crop made from it for social cards. */
export const FLYER_SRC = '/photos/parking-fundraiser.png';
export const FLYER_OG_SRC = '/photos/parking-fundraiser-og.jpg';

/** Adults an organization has to bring on the night. */
export const VOLUNTEER_MINIMUM = 6;

/** Days after the game within which the payout is made. */
export const PAYOUT_WINDOW_DAYS = 7;

/** What a vehicle pays at the gate. */
export const PARKING_PRICE_CENTS = 1000;

/** The organization's share of gross parking. */
export const PAYOUT_RATE = 0.5;

/**
 * Bumped when the terms change, and stamped on every application.
 *
 * Bumped for the rename. The clauses did not change, but the program's name
 * appears inside several of them, so the text an applicant reads today is not
 * byte for byte the text 'fnf-v1.0-2026' rows were shown. A version that covers
 * two different documents is worse than useless on the day somebody asks what
 * an organization actually agreed to.
 *
 * Rows signed before this bump still carry 'fnf-v1.0-2026' and that text is no
 * longer in the repo. The vendor agreement keeps every version it has ever
 * shipped under lib/agreement/versions for this reason; these terms do not yet,
 * and should.
 */
export const TERMS_VERSION = 'fundraiser-v1.1-2026';

export const ORG_TYPES = [
  'School or school group',
  'Booster club',
  'Sports team',
  'Church or faith group',
  'Youth organization',
  'Nonprofit',
  'Civic or service club',
  'Other community group',
] as const;

export type OrgStatus = 'pending' | 'selected' | 'declined' | 'withdrawn';

/** Statuses that stay in the draw. A declined or withdrawn org does not. */
export const DRAWABLE_STATUSES: OrgStatus[] = ['pending', 'selected'];

export function payoutFor(grossCents: number): number {
  return Math.round(grossCents * PAYOUT_RATE);
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/* ------------------------------------------------------------- the ledger */

export type LedgerRow = {
  eventSlug: string;
  eventName: string;
  eventDate: string;
  orgName: string;
  parkingGrossCents: number | null;
  payoutCents: number | null;
  paidAt: string | null;
};

export type AwardRow = {
  event_slug: string;
  org_application_id: string | null;
  picked_at: string | null;
  picked_from_count: number | null;
  parking_gross_cents: number | null;
  payout_cents: number | null;
  paid_at: string | null;
  paid_method: string | null;
  published_at: string | null;
  notes: string | null;
};

export const AWARD_COLUMNS =
  'event_slug, org_application_id, picked_at, picked_from_count, parking_gross_cents, ' +
  'payout_cents, paid_at, paid_method, published_at, notes';

/**
 * Every award, whether or not it is published.
 *
 * The public page filters to published rows itself. Handing the tracker the
 * same read means the two cannot disagree about which game is spoken for.
 */
export async function getAwards(): Promise<AwardRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('org_event_awards')
      .select(AWARD_COLUMNS)
      .order('event_slug', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as AwardRow[];
  } catch (err) {
    console.error('could not read org_event_awards', err);
    return [];
  }
}

/**
 * The public ledger: games whose result has been published.
 *
 * This is the whole reason anybody believes the program. A number that is only
 * ever promised is a promise; a number that is posted afterwards, game by game,
 * is a record. So it is a real join rather than a hand kept list, and it shows
 * the gross alongside the payout so the arithmetic is checkable.
 */
export async function getPublishedLedger(): Promise<LedgerRow[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('org_event_awards')
      .select(AWARD_COLUMNS)
      .not('published_at', 'is', null)
      .order('event_slug', { ascending: false });

    if (error) throw error;

    const awards = (data ?? []) as unknown as AwardRow[];
    if (!awards.length) return [];

    const orgIds = awards.map((a) => a.org_application_id).filter(Boolean) as string[];
    const names = new Map<string, string>();

    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from('org_applications')
        .select('id, org_name')
        .in('id', orgIds);
      for (const o of (orgs ?? []) as { id: string; org_name: string }[]) {
        names.set(o.id, o.org_name);
      }
    }

    const events = await getEvents();

    return awards.map((a) => {
      const event = events.find((e) => e.slug === a.event_slug);
      return {
        eventSlug: a.event_slug,
        eventName: event?.name ?? a.event_slug,
        eventDate: event?.displayDate ?? '',
        orgName: a.org_application_id ? (names.get(a.org_application_id) ?? 'An Alice organization') : 'An Alice organization',
        parkingGrossCents: a.parking_gross_cents,
        payoutCents: a.payout_cents,
        paidAt: a.paid_at,
      };
    });
  } catch (err) {
    console.error('could not read the published ledger', err);
    return [];
  }
}

/** Upcoming home games, with whether each one already has an org. */
export type GameSlot = {
  event: EventConfig;
  taken: boolean;
  orgName: string | null;
};

export async function getGameSlots(now: number = Date.now()): Promise<GameSlot[]> {
  const [events, awards] = await Promise.all([getEvents(), getAwards()]);
  const upcoming = events.filter((e) => endsAtMs(e) > now);
  if (!upcoming.length) return [];

  const byEvent = new Map(awards.map((a) => [a.event_slug, a]));
  const orgIds = awards.map((a) => a.org_application_id).filter(Boolean) as string[];
  const names = new Map<string, string>();

  if (orgIds.length && isSupabaseConfigured()) {
    const { data } = await getSupabaseAdmin()
      .from('org_applications')
      .select('id, org_name')
      .in('id', orgIds);
    for (const o of (data ?? []) as { id: string; org_name: string }[]) names.set(o.id, o.org_name);
  }

  return upcoming.map((event) => {
    const award = byEvent.get(event.slug);
    return {
      event,
      taken: Boolean(award),
      /* Only named publicly once the award is published. A pick that has been
         made but not announced is Robert's to announce. */
      orgName:
        award?.published_at && award.org_application_id
          ? (names.get(award.org_application_id) ?? null)
          : null,
    };
  });
}

/* --------------------------------------------------------------- the draw */

/**
 * Pick one from a list, uniformly, using the operating system's randomness.
 *
 * crypto.randomInt rather than Math.random. Math.random is seeded per process
 * and is not uniform in the tail, and more to the point this is a program whose
 * entire credibility rests on the pick being fair. "We used the good random
 * number generator" is a sentence worth being able to say plainly.
 */
export function drawOne<T>(pool: readonly T[]): T | null {
  if (!pool.length) return null;
  return pool[randomInt(pool.length)];
}

/* ----------------------------------------------------- the applications */

export type OrgApplicationRow = {
  id: string;
  org_name: string;
  org_type: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  ein: string | null;
  is_501c3: boolean | null;
  volunteer_count: number | null;
  story: string | null;
  logo_path: string | null;
  event_slugs: string[] | null;
  status: string | null;
  created_at: string;
};

const ORG_COLUMNS =
  'id, org_name, org_type, contact_name, email, phone, ein, is_501c3, volunteer_count, ' +
  'story, logo_path, event_slugs, status, created_at';

/** Every application, newest first. Withdrawn ones included: it is a record. */
export async function getOrgApplications(): Promise<OrgApplicationRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('org_applications')
      .select(ORG_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as OrgApplicationRow[];
  } catch (err) {
    console.error('could not read org_applications', err);
    return [];
  }
}
