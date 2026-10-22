/**
 * The Turkey Trot, as data.
 *
 * No server-only import and no database here, because the registration form is
 * a client component and the pricing has to be the same number in the page, in
 * the form, in the JSON-LD offers and in what Square charges. One file, read
 * everywhere, hardcoded nowhere.
 *
 * Dates are not in here. They live on the races row, because the one time a
 * date was written into code it was wrong inside a week. What this file knows
 * is how to read a clock against the dates it is handed.
 */

/** The phrase this page is written to be found by. One constant, one place. */
export const RACE_PHRASE = 'Alice TX turkey trot';

/** The race's own name, as it appears in every heading and title. */
export const RACE_NAME = 'Coyoteville 1st Annual Turkey Trot';

export const RACE_SLUG = 'turkey-trot-2026';

/**
 * How far it is, in the only words that are true.
 *
 * The course is not USATF certified and nothing on the site may imply it is.
 * "Approximately 3.1 miles" is the honest description and it is a constant so
 * that a "5K" cannot creep into one heading and not another.
 */
export const RACE_DISTANCE = 'approximately 3.1 miles';

/* ------------------------------------------------------------- the money */

/**
 * Entry prices, in cents.
 *
 * Adult entry escalates on the clock and nothing else: early until the shirt
 * deadline, regular until race day, race day on the day. A child's entry never
 * escalates, which is a decision rather than an oversight: a parent deciding on
 * Friday night whether to bring two kids should not be punished for it.
 */
export const RACE_PRICING = {
  adultEarly: 2500,
  adultRegular: 3000,
  adultRaceDay: 3500,
  kid: 1000,
  /** Up to five runners, at least one adult. One payment. */
  family: 7500,
  /** Each, ten runner minimum, the captain pays once for all of them. */
  team: 2000,
} as const;

/**
 * Add ons, in cents. Everything here is optional.
 *
 * Two were retired on 2026-10-22 and the database now refuses them:
 * race_registrations_no_bib_name requires bib_name to be null and
 * race_registrations_no_food_voucher requires food_voucher to be false.
 * Both columns remain so rows written before that date still mean what they
 * meant. Nothing may write either again.
 */
export const RACE_ADDONS = {
  shirt: 2500,
  extraMedal: 1000,
  parkingPass: 1000,
} as const;

/** The number of runners a family entry covers. */
export const FAMILY_MAX_RUNNERS = 5;

/** The smallest team. Below this the per runner price does not apply. */
export const TEAM_MIN_RUNNERS = 10;

/** Twelve and under pays the kid price. Eighteen and over is not a minor. */
export const KID_MAX_AGE = 12;
export const ADULT_MIN_AGE = 18;

/**
 * Money, with a thousand separator.
 *
 * The separator is not decoration. A title sponsorship rendered as $1500 reads
 * as a smaller number than $1,500 at a glance, and the glance is what this page
 * gets. Whole dollars drop the cents, because every price here is whole.
 */
export function dollars(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  const whole = safe % 100 === 0;
  return `$${(safe / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/* -------------------------------------------------------------- the tiers */

/**
 * The tiers the database accepts.
 *
 * 'virtual' was retired on 2026-10-22 and race_registrations_tier_check no
 * longer allows it, so a row using it is refused by Postgres rather than
 * written and ignored. Rows that already carry it keep their meaning; this
 * list is what may be written from now on.
 */
export const RACE_TIERS = ['adult', 'kid', 'family', 'team'] as const;
export type RaceTier = (typeof RACE_TIERS)[number];

export function isRaceTier(value: unknown): value is RaceTier {
  return typeof value === 'string' && (RACE_TIERS as readonly string[]).includes(value);
}

/** Which of the three adult prices the clock is on. */
export type PriceWindow = 'early' | 'regular' | 'raceDay' | 'closed';

export type RaceClock = {
  /** When the race starts. */
  startsAtMs: number;
  /** When shirts stop being orderable, and when early pricing ends. */
  shirtDeadlineMs: number;
  /** When registration shuts. 7:00 AM on race morning for the Turkey Trot. */
  registrationClosesMs: number;
  /** When registration opened. Null when the row carries none. */
  registrationOpensMs: number | null;
};

/**
 * Where the clock is, which decides the adult price and whether shirts are
 * still available.
 *
 * Race day is "the calendar day the race starts on, in Central", not "within
 * 24 hours of the gun". Somebody registering at nine on Friday night is paying
 * the regular price and somebody registering at six on Saturday morning is
 * paying race day, which is what a runner expects and what a volunteer at a
 * table can explain.
 */
export function priceWindowAt(clock: RaceClock, now: number): PriceWindow {
  if (now >= clock.registrationClosesMs) return 'closed';
  if (now <= clock.shirtDeadlineMs) return 'early';

  /* The start of race day, Central, derived from the start time rather than
     from a second date written down somewhere. */
  const raceDayStart = startOfCentralDay(clock.startsAtMs);
  if (now >= raceDayStart) return 'raceDay';

  return 'regular';
}

/**
 * Midnight Central on the day a timestamp falls on.
 *
 * Built from the formatted parts rather than from an offset, so it is right on
 * both sides of a daylight saving change without anybody having to remember
 * which side November is on.
 */
export function startOfCentralDay(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  /* How far into the Central day this instant is, subtracted from it. No zone
     arithmetic and no offset table. */
  const intoDay = get('hour') * 3600000 + get('minute') * 60000 + get('second') * 1000;
  return ms - intoDay;
}

/** What one adult entry costs right now. */
export function adultPriceAt(clock: RaceClock, now: number): number {
  const window = priceWindowAt(clock, now);
  if (window === 'early') return RACE_PRICING.adultEarly;
  if (window === 'regular') return RACE_PRICING.adultRegular;
  return RACE_PRICING.adultRaceDay;
}

/** Are shirts still orderable? They close with the printer's deadline. */
export function shirtsAvailableAt(clock: RaceClock, now: number): boolean {
  return now <= clock.shirtDeadlineMs;
}

/** Is registration open at all? */
export function registrationOpenAt(clock: RaceClock, now: number): boolean {
  if (clock.registrationOpensMs !== null && now < clock.registrationOpensMs) return false;
  return now < clock.registrationClosesMs;
}

/* ----------------------------------------------------------------- ages */

/**
 * How old a runner is on the day they run.
 *
 * Against the race date rather than today, because that is the number the
 * bracket uses and the number stored on the row. Returns null for a date that
 * cannot be read, which the form refuses rather than guessing at.
 */
export function ageOnRaceDay(dateOfBirth: string, raceStartsAtMs: number): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim());
  if (!match) return null;

  const [, y, m, d] = match;
  const born = { year: Number(y), month: Number(m), day: Number(d) };
  if (born.month < 1 || born.month > 12 || born.day < 1 || born.day > 31) return null;

  const race = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(raceStartsAtMs));

  const part = (type: string) => Number(race.find((p) => p.type === type)?.value ?? 0);
  const on = { year: part('year'), month: part('month'), day: part('day') };

  let age = on.year - born.year;
  if (on.month < born.month || (on.month === born.month && on.day < born.day)) age -= 1;

  if (age < 0 || age > 120) return null;
  return age;
}

/** Under eighteen on race day. Computed, never asked. */
export function isMinorAge(age: number): boolean {
  return age < ADULT_MIN_AGE;
}

/** What one runner of this age pays, on their own. */
export function entryPriceForAge(age: number, clock: RaceClock, now: number): number {
  return age <= KID_MAX_AGE ? RACE_PRICING.kid : adultPriceAt(clock, now);
}

/* ------------------------------------------------------- the award groups */

/**
 * The age brackets, for the export that exists against the day chip_timed
 * becomes true.
 *
 * Written out rather than generated so the edges are visible: a runner who is
 * exactly 15 is in 15-19 and not in 11-14, and that is the kind of thing a
 * loop with an off by one gets wrong silently.
 */
export const AGE_GROUPS: { label: string; min: number; max: number }[] = [
  { label: '10 and under', min: 0, max: 10 },
  { label: '11 to 14', min: 11, max: 14 },
  { label: '15 to 19', min: 15, max: 19 },
  { label: '20 to 29', min: 20, max: 29 },
  { label: '30 to 39', min: 30, max: 39 },
  { label: '40 to 49', min: 40, max: 49 },
  { label: '50 to 59', min: 50, max: 59 },
  { label: '60 to 69', min: 60, max: 69 },
  { label: '70 and over', min: 70, max: 200 },
];

export function ageGroupFor(age: number): string {
  return AGE_GROUPS.find((g) => age >= g.min && age <= g.max)?.label ?? 'unknown';
}

/* ------------------------------------------------------------- the shirts */

export const SHIRT_SIZES = ['YS', 'YM', 'YL', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export function isShirtSize(value: unknown): value is ShirtSize {
  return typeof value === 'string' && (SHIRT_SIZES as readonly string[]).includes(value);
}

/** What every entry includes, whatever it cost. Rendered on the page. */
export const ENTRY_INCLUDES = [
  'A race bib with your name on it if you add one.',
  'A finisher medal, handed to you at the line.',
  'The park open afterwards, with food trucks and coffee.',
];
