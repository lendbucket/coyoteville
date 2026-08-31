import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { getSpots } from './spots';
import {
  EVENTS,
  EVENT_TIMEZONE,
  UPCOMING_EVENTS,
  eventEndsAt,
  formatEventDeadline,
  gatesOpenAt,
  nextEventByDate,
  signupClosesAt,
  type EventConfig,
} from './seo';
import { zoneAbbreviation } from './time';
import { availability, eventLifecycle, type EventLifecycle } from './event-state';

/**
 * The live schedule: the static calendar in lib/seo joined to the parts of an
 * event that change without a deploy.
 *
 * lib/seo holds names, dates and display strings, which have to match the
 * metadata and the structured data and so belong in the build. The events table
 * holds the signup deadline, whether the event is published, and capacity,
 * which the person running the lot needs to be able to change from Supabase on
 * a Thursday night without waiting for a deploy.
 *
 * Precedence is: the database wins when it has an answer, the static config is
 * the fallback. If Supabase is unreachable the site still renders a correct
 * schedule from the build, just without any override that was set since.
 *
 * An event is open for signup when it is published, its deadline has not
 * passed, and it is not full. Anything that is not open sends the vendor to the
 * waitlist rather than to a dead end.
 */

export type ScheduledEvent = Omit<EventConfig, 'signupClosesDisplay'> & {
  /** UTC ms of the signup cutoff. From the events table when set. */
  signupClosesAtMs: number;
  /**
   * Zone label for that instant, eg "CDT". Derived from signupClosesAtMs
   * rather than from the static config, because a deadline moved in the
   * database could land on the other side of a daylight saving change.
   */
  signupClosesZoneLabel: string;
  /**
   * The cutoff written out, derived from signupClosesAtMs rather than from the
   * static literal, so a deadline moved in the events table reads correctly on
   * the page instead of showing the date it was built with.
   */
  signupClosesDisplay: string;
  /** Gates open, as a UTC instant. */
  gatesOpenAtMs: number;
  /** When the night finishes, so the site can roll forward on its own. */
  endsAtMs: number;
  /** True when the cutoff is in the past. */
  deadlinePassed: boolean;
  /** False hides an event from the form and the schema entirely. */
  isPublished: boolean;
  /**
   * Every booth and truck spot claimed. Null when no capacity is set, which
   * means "cannot tell", not "full".
   */
  isFull: boolean | null;
  /** Spots left across both paid types, or null when capacity is unknown. */
  remaining: number | null;
  /** Published, deadline not passed, and not known to be full. */
  isOpen: boolean;
  /**
   * Taking applications for this type in particular.
   *
   * Intake is capped per spot type, so an event with the booths shut and the
   * trucks open is closed to one vendor and open to the next. isOpen is the
   * coarse answer and stays true while either type is taking; these two are
   * what actually decide whether a given vendor can apply.
   */
  boothOpen: boolean;
  truckOpen: boolean;
  /**
   * The one answer to "what state is this event in", derived from the clock on
   * every request. Everything the public site renders about an event gates on
   * this rather than on is_published or on a date compiled into the build.
   */
  lifecycle: EventLifecycle;
};

type EventRow = {
  slug: string;
  is_published: boolean | null;
  signup_closes_at: string | null;
};

const TTL_MS = 30_000;
let cached: { at: number; rows: Map<string, EventRow> } | null = null;

/**
 * Whether events.signup_closes_at exists. Null until the first query answers.
 * Remembered so a database that has not had the column added yet costs one
 * failed query per process rather than one per render.
 */
let deadlineColumnPresent: boolean | null = null;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message ?? '');
}

async function loadRows(): Promise<Map<string, EventRow>> {
  const hit = cached;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const rows = new Map<string, EventRow>();
  if (!isSupabaseConfigured()) return rows;

  try {
    const supabase = getSupabaseAdmin();
    const columns =
      deadlineColumnPresent === false
        ? 'slug, is_published'
        : 'slug, is_published, signup_closes_at';

    const { data, error } = await supabase.from('events').select(columns);

    if (error) {
      if (isMissingColumn(error) && deadlineColumnPresent !== false) {
        // Schema has not been re-run yet. Fall back to the static deadlines
        // rather than failing the render, and stop asking for the column.
        deadlineColumnPresent = false;
        console.warn(
          'events.signup_closes_at is missing; using the deadlines compiled into lib/seo'
        );
        return loadRows();
      }
      throw error;
    }

    deadlineColumnPresent = deadlineColumnPresent ?? true;

    for (const row of (data ?? []) as unknown as EventRow[]) {
      rows.set(row.slug, row);
    }

    cached = { at: Date.now(), rows };
    return rows;
  } catch (err) {
    // A schedule that lies is worse than one built from the last good deploy.
    console.error('event schedule read failed', err);
    return rows;
  }
}

async function decorate(event: EventConfig, row: EventRow | undefined, now: number) {
  const parsed = row?.signup_closes_at ? Date.parse(row.signup_closes_at) : NaN;
  const signupClosesAtMs = Number.isNaN(parsed) ? signupClosesAt(event) : parsed;

  const spots = await getSpots(event.slug);
  const remaining = spots.capacityKnown ? spots.total.remaining : null;

  /* Full means no more applications are being taken, which is not the same as
     no spots left. Intake runs a few past capacity so the review queue has
     something to choose between, so this is measured against the review slots
     rather than against the physical room. The spots meter still counts against
     capacity, so an event can honestly read as sold out while its last few
     review slots are open, and that is the intended state: the spots really are
     spoken for, and the applications still coming in are the ones that get a
     look if any of those fall through. */
  const reviewRemaining = spots.capacityKnown ? spots.total.reviewRemaining : null;
  const isFull = reviewRemaining === null ? null : reviewRemaining <= 0;

  const isPublished = row?.is_published ?? true;
  const deadlinePassed = now >= signupClosesAtMs;

  /* Room per spot type, off the corrected capacity count: rows for the event
     that are not denied, against the plain capacity columns. The same snapshot
     the tracker reads, so the public page and the admin cannot disagree about
     whether a date is full. */
  const lifecycle = eventLifecycle(
    {
      isPublished,
      startsAtMs: gatesOpenAt(event),
      endsAtMs: eventEndsAt(event),
      signupClosesAtMs,
      booth: availability(spots.booth.capacity, spots.booth.held),
      truck: availability(spots.truck.capacity, spots.truck.held),
    },
    now
  );

  return {
    lifecycle,
    ...event,
    signupClosesAtMs,
    signupClosesZoneLabel: zoneAbbreviation(signupClosesAtMs, EVENT_TIMEZONE),
    signupClosesDisplay: formatEventDeadline(signupClosesAtMs),
    gatesOpenAtMs: gatesOpenAt(event),
    endsAtMs: eventEndsAt(event),
    deadlinePassed,
    isPublished,
    isFull,
    remaining,
    isOpen: isPublished && !deadlinePassed && isFull !== true,
    // A null review remainder means no capacity is set, which is "cannot
    // tell" rather than "full", so it stays open the same way isFull does.
    boothOpen:
      isPublished && !deadlinePassed && (spots.booth.reviewRemaining ?? 1) > 0,
    truckOpen:
      isPublished && !deadlinePassed && (spots.truck.reviewRemaining ?? 1) > 0,
  };
}

/** Every event in the calendar, oldest first, decorated with live state. */
export const getSchedule = cache(async (now: number = Date.now()): Promise<ScheduledEvent[]> => {
  const rows = await loadRows();
  return Promise.all(UPCOMING_EVENTS.map((e) => decorate(e, rows.get(e.slug), now)));
});

/** Only the events a vendor can actually sign up for, oldest first. */
export async function getOpenEvents(now: number = Date.now()): Promise<ScheduledEvent[]> {
  return (await getSchedule(now)).filter((e) => e.lifecycle.canApply);
}

/**
 * Events the public site may render: anything not PAST.
 *
 * This used to filter on is_published alone, which is why a finished event was
 * still on the homepage with a working waitlist link two days after it ended.
 * A PAST event is gone from here, and therefore gone from the event cards, the
 * form's dropdown and the structured data, without anybody flipping a column.
 */
export async function getSelectableEvents(now: number = Date.now()): Promise<ScheduledEvent[]> {
  return (await getSchedule(now)).filter((e) => e.lifecycle.publiclyVisible);
}

/** Every event including the finished ones. For the tracker, never the site. */
export async function getAllEvents(now: number = Date.now()): Promise<ScheduledEvent[]> {
  return getSchedule(now);
}

/** The soonest event still taking applications, or null when none is. */
export async function getNextOpenEvent(now: number = Date.now()): Promise<ScheduledEvent | null> {
  return (await getOpenEvents(now))[0] ?? null;
}

/** One event by slug, or null when the slug is not in the calendar. */
export async function getScheduledEvent(
  slug: string,
  now: number = Date.now()
): Promise<ScheduledEvent | null> {
  return (await getSchedule(now)).find((e) => e.slug === slug) ?? null;
}

/**
 * The event a vendor lands on by default.
 *
 * The soonest still open, falling back to the soonest published one so the
 * form always has something selected even when everything has closed and the
 * page is really offering a waitlist.
 */
export async function getDefaultEvent(now: number = Date.now()): Promise<ScheduledEvent | null> {
  const open = await getNextOpenEvent(now);
  if (open) return open;
  return (await getSelectableEvents(now))[0] ?? null;
}

/** Slugs the API routes will accept. Static, so it needs no round trip. */
export const KNOWN_EVENT_SLUGS: readonly string[] = EVENTS.map((e) => e.slug);

/**
 * The next event by date, decorated with its live state.
 *
 * What the hero and the countdown bar point at: the event the public is coming
 * to, which stays put after vendor signup shuts and only moves on once the
 * night is over.
 */
export async function getNextEventByDate(now: number = Date.now()): Promise<ScheduledEvent> {
  const wanted = nextEventByDate(now);
  const schedule = await getSchedule(now);
  return schedule.find((e) => e.slug === wanted.slug) ?? schedule[0];
}
