/**
 * Timezone arithmetic for the countdowns.
 *
 * Both countdowns have to land on the same instant for every visitor, whatever
 * their device is set to. Two things make that true:
 *
 *   1. A deadline is configured as a wall clock time plus an IANA zone, and is
 *      resolved to a single UTC instant here. It is not stored with a hardcoded
 *      offset, so a deadline in November gets CST and one in August gets CDT
 *      without anyone remembering to change a number.
 *
 *   2. The countdown components are handed the server's clock and measure
 *      against that, so a visitor whose laptop is a day out still sees the
 *      right numbers. See components/Countdown.tsx.
 */

/** Everything Coyoteville schedules runs on Alice, Texas local time. */
export const EVENT_TIMEZONE = 'America/Chicago';

/**
 * Offset of `timeZone` from UTC, in milliseconds, at the given instant.
 * Positive west of Greenwich is negative here, matching the sign convention of
 * an ISO offset: America/Chicago in summer returns -5 hours.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }

  // Intl can render midnight as hour 24 in some engines. Normalise it.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );

  return asIfUtc - instantMs;
}

/**
 * Resolve a wall clock time in `timeZone` to a UTC timestamp in milliseconds.
 *
 * The offset depends on the instant, and the instant is what we are solving
 * for, so this guesses once and corrects. Both candidate offsets are then
 * checked by formatting back: whichever reproduces the requested wall clock is
 * the right one.
 *
 * The two awkward cases either side of a daylight saving change:
 *
 *   Repeated hour (clocks go back). Two instants share the wall clock time.
 *   We take the earlier one, which is the first time the clock reads it.
 *
 *   Missing hour (clocks go forward). No instant has that wall clock time at
 *   all. We resolve forward, past the gap, so a 2:30am deadline on a
 *   spring-forward Sunday becomes 3:30am rather than silently moving to the
 *   previous hour. Forward is the safer direction for a cutoff.
 */
export function zonedWallClockToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = EVENT_TIMEZONE
): number {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);

  const firstOffset = zoneOffsetMs(wanted, timeZone);
  const candidateA = wanted - firstOffset;

  const secondOffset = zoneOffsetMs(candidateA, timeZone);
  const candidateB = wanted - secondOffset;

  // A candidate is correct when reading it back in the zone gives the wall
  // clock we were asked for.
  const roundTrips = (instant: number) =>
    instant + zoneOffsetMs(instant, timeZone) === wanted;

  const a = roundTrips(candidateA);
  const b = roundTrips(candidateB);

  if (a && b) return Math.min(candidateA, candidateB); // repeated hour
  if (a) return candidateA;
  if (b) return candidateB;

  // Missing hour. Neither reads back, so step forward out of the gap.
  return Math.max(candidateA, candidateB);
}

/**
 * Parse a `YYYY-MM-DDTHH:mm:ss` wall clock string in `timeZone`.
 * Deliberately not `new Date(string)`, which would read it as the visitor's
 * local time, which is the bug this whole module exists to avoid.
 */
export function parseZonedWallClock(local: string, timeZone: string = EVENT_TIMEZONE): number {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    throw new Error(
      `Expected a wall clock time like 2026-08-26T23:59:59, received "${local}".`
    );
  }

  return zonedWallClockToUtcMs(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
    timeZone
  );
}

export type Remaining = {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

/** Break a millisecond gap into whole units. Never returns negatives. */
export function splitRemaining(ms: number): Remaining {
  const total = Math.max(0, ms);
  const totalSeconds = Math.floor(total / 1000);

  return {
    total,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    expired: total <= 0,
  };
}

/** Short zone label for display, eg "CDT" in summer and "CST" in winter. */
export function zoneAbbreviation(
  instantMs: number,
  timeZone: string = EVENT_TIMEZONE
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(instantMs));

  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}
