import 'server-only';
import { getEventBySlug } from '@/lib/events-source';
import { clockTime, weekdayAndDate } from '@/lib/race-dates';

/**
 * The two food truck nights either side of the race.
 *
 * These are rows in `events`, not in `races`, and for a while they were the one
 * thing on the race pages still printed by hand. check-race-dates allowed six
 * lines for exactly this reason, with a note saying to delete them when the
 * rows published. Both published on 2026-10-22, so they are derived now and
 * the allowlist is empty.
 *
 * Both slugs are fixed strings because they are two specific rows, not a
 * query. If either is renamed this returns null for it and the copy falls back
 * to naming no date at all, which is the right failure: a sentence that says
 * "the night before" is useless, while a sentence naming the wrong Friday sends
 * somebody to a closed lot.
 */

export const RACE_EVENT_SLUGS = {
  pickup: 'turkey-trot-packet-pickup-2026-11-13',
  morning: 'turkey-trot-race-morning-2026-11-14',
} as const;

export type RaceNight = {
  slug: string;
  /** "Friday, November 13". */
  weekday: string;
  /** "5:30 PM", the time the lot opens. */
  opens: string;
  signupHref: string;
};

async function night(slug: string): Promise<RaceNight | null> {
  const event = await getEventBySlug(slug);
  if (!event) return null;

  const starts = Date.parse(event.startISO);
  if (!Number.isFinite(starts)) return null;

  return {
    slug,
    weekday: weekdayAndDate(starts),
    opens: clockTime(starts),
    /* Query first, then the fragment: /?event=slug#apply, which is what
       EventsSection has always built. Written the other way round the query
       ends up inside the fragment, where the form never sees it, and the link
       still returns 200 so nothing complains. */
    signupHref: `/?event=${encodeURIComponent(slug)}#apply`,
  };
}

export async function getRaceNights(): Promise<{
  pickup: RaceNight | null;
  morning: RaceNight | null;
}> {
  const [pickup, morning] = await Promise.all([
    night(RACE_EVENT_SLUGS.pickup),
    night(RACE_EVENT_SLUGS.morning),
  ]);

  return { pickup, morning };
}
