import type { Race } from './races';

/**
 * Every human readable date and time this site prints for the race, derived.
 *
 * None of these is typed out anywhere else. That is the whole point: the
 * sponsorship agreement said the shirt deadline was November 2 while the column
 * resolved to November 1, and nothing could see it, because the sentence was a
 * string in one file and the timestamp was a column in another. A date printed
 * by hand is a date that will eventually disagree with the thing it came from.
 *
 * All of it resolves in America/Chicago. The race is in Alice and every time on
 * the site is the time a runner will be standing there, not UTC and not the
 * reader's own zone. November is the month the clocks go back, so this is also
 * the month where getting it wrong is easiest: in 2026 daylight saving ends on
 * November 1, which is why the shirt deadline moved a day under the old
 * timestamp.
 *
 * check-race-dates drives these against the live column values and fails the
 * build if any of them stops matching.
 */

const ZONE = 'America/Chicago';

function parts(ms: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString('en-US', { timeZone: ZONE, ...options });
}

/** "Saturday, November 14, 2026". */
export function longDate(ms: number): string {
  return parts(ms, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "November 14". */
export function shortDate(ms: number): string {
  return parts(ms, { month: 'long', day: 'numeric' });
}

/**
 * "Saturday, November 14".
 *
 * The weekday comes from the instant too. Writing "Saturday," by hand and
 * deriving only the date is the same bug in a smaller box: it is correct until
 * somebody moves the race, and then it is a weekday that disagrees with its own
 * date on the homepage.
 */
export function weekdayAndDate(ms: number): string {
  return parts(ms, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "November 2, 2026". */
export function monthDayYear(ms: number): string {
  return parts(ms, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "8:00 AM". */
export function clockTime(ms: number): string {
  return parts(ms, { hour: 'numeric', minute: '2-digit' });
}

export type RaceDates = {
  /** "Saturday, November 14, 2026". */
  startLong: string;
  /** "November 14". */
  startShort: string;
  /** "Saturday, November 14". */
  startWeekday: string;
  /** "8:00 AM". */
  startTime: string;
  /**
   * "7:00 AM". The moment registration closes is the moment check in closes,
   * because they are the same deadline: a runner who has not checked in by
   * then is not running, and a runner who has not registered by then is not
   * either. One column, one time, said once.
   */
  checkInTime: string;
  /** "November 2, 2026". */
  shirtDeadlineLong: string;
  /** "November 2". */
  shirtDeadlineShort: string;
  /** True once the printer has the order. */
  shirtDeadlinePassed: boolean;
};

export function raceDates(race: Race, now: number = Date.now()): RaceDates {
  const starts = Date.parse(race.startsAtISO);
  const closes = Date.parse(race.registrationClosesAtISO);
  const shirts = Date.parse(race.shirtDeadlineAtISO);

  return {
    startLong: longDate(starts),
    startShort: shortDate(starts),
    startWeekday: weekdayAndDate(starts),
    startTime: clockTime(starts),
    checkInTime: clockTime(closes),
    shirtDeadlineLong: monthDayYear(shirts),
    shirtDeadlineShort: shortDate(shirts),
    shirtDeadlinePassed: now > shirts,
  };
}
