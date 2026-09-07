import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { EVENT_TIMEZONE, type EventConfig } from './seo';

/**
 * The event calendar, read from the events table.
 *
 * This is the only place events come from. There is no static list in code any
 * more, deliberately, because a hand maintained copy of a database table is a
 * second source of truth and the two drift the moment somebody inserts a row.
 * That is not a hypothetical here: three home games sat in the events table
 * while the site showed one, for the same reason NEXT_EVENT once advertised an
 * event that had already happened.
 *
 * Cached per render pass with React's cache(), so a page whose hero, ticker,
 * countdown and structured data all ask for the next event does one read rather
 * than five.
 *
 * On a database failure this returns an empty list rather than a stale one.
 * That sounds worse than a static fallback and is not: the homepage is ISR at
 * revalidate 60, and a regeneration that throws leaves the previous page in
 * place, so a transient blip is absorbed by the cache rather than by a copy of
 * the calendar that somebody has to remember to edit.
 */

type EventRow = {
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  display_date: string | null;
  display_time: string | null;
  blurb: string | null;
  is_published: boolean | null;
  signup_closes_at: string | null;
};

const COLUMNS = 'slug, name, starts_at, ends_at, display_date, display_time, blurb, is_published, signup_closes_at';

/** A wall clock string in EVENT_TIMEZONE, "YYYY-MM-DDTHH:mm:ss", from an instant. */
function toLocalWallClock(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/** The Central date an event falls on, "YYYY-MM-DD". */
function toLocalDate(iso: string): string {
  return toLocalWallClock(iso).slice(0, 10);
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function shortTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function longDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Two days before, 11:59:59 PM Central. The house rule when none is set. */
function defaultCutoff(startsAt: string): string {
  const day = toLocalDate(startsAt);
  const [y, m, d] = day.split('-').map(Number);
  const two = new Date(Date.UTC(y, m - 1, d - 2));
  return `${two.toISOString().slice(0, 10)}T23:59:59`;
}

function toEventConfig(row: EventRow): EventConfig {
  const endISO = row.ends_at ?? row.starts_at;
  const signupLocal = row.signup_closes_at
    ? toLocalWallClock(row.signup_closes_at)
    : defaultCutoff(row.starts_at);

  return {
    slug: row.slug,
    name: row.name,
    date: toLocalDate(row.starts_at),
    startISO: row.starts_at,
    endISO,
    displayDate: row.display_date || longDate(row.starts_at),
    displayTime: row.display_time || shortTime(row.starts_at),
    blurb: row.blurb || '',
    signupClosesLocal: signupLocal,
    signupClosesDisplay: row.signup_closes_at
      ? longDateTime(row.signup_closes_at)
      : longDateTime(`${signupLocal}Z`),
    gatesOpenLocal: toLocalWallClock(row.starts_at),
  } as EventConfig;
}

/**
 * Every published event, oldest first.
 *
 * Unpublished rows are left out here rather than filtered by each caller, so an
 * event being drafted in Supabase cannot appear in a dropdown, in the schedule
 * or in the structured data by somebody forgetting a check.
 */
export const getEvents = cache(async (): Promise<EventConfig[]> => {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('events')
      .select(COLUMNS)
      .eq('is_published', true)
      .order('starts_at', { ascending: true });

    if (error) throw error;
    return ((data ?? []) as unknown as EventRow[]).map(toEventConfig);
  } catch (err) {
    console.error('could not read the events table', err);
    return [];
  }
});

/** UTC instant an event finishes. */
export function endsAtMs(event: EventConfig): number {
  const parsed = Date.parse(event.endISO);
  return Number.isNaN(parsed) ? Date.parse(event.startISO) : parsed;
}

/**
 * The soonest event that has not finished yet.
 *
 * What the public half of the site means by "next": the event people are
 * actually coming to, which stays true after vendor signup shuts two days out
 * and only moves on once the night is over. Falls back to the last event when
 * every one has been and gone, and to null when the calendar is empty.
 */
export const getNextEvent = cache(async (now: number = Date.now()): Promise<EventConfig | null> => {
  const events = await getEvents();
  if (!events.length) return null;
  return events.find((e) => endsAtMs(e) > now) ?? events[events.length - 1];
});

/** One event by slug, or null. */
export async function getEventBySlug(slug: string): Promise<EventConfig | null> {
  return (await getEvents()).find((e) => e.slug === slug) ?? null;
}

/**
 * A slug to name lookup, for the many places that only want a label.
 *
 * Emails, admin routes and PDF headers all used to do EVENTS.find(...)?.name
 * against the static array. They ask here instead, and fall back to the slug
 * itself so a label lookup can never be the thing that fails a payment email.
 */
export async function eventNameFor(slug: string | null | undefined): Promise<string> {
  if (!slug) return 'Coyoteville';
  const event = await getEventBySlug(slug);
  return event?.name ?? slug;
}

/** Whether a slug names a real published event. Used to validate input. */
export async function isKnownEventSlug(slug: string): Promise<boolean> {
  return Boolean(await getEventBySlug(slug));
}
