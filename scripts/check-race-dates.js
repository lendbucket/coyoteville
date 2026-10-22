#!/usr/bin/env node
'use strict';

/**
 * Does every date this build prints for the race agree with its column?
 *
 * The sponsorship agreement said the shirt deadline was November 2 while
 * races.shirt_deadline_at resolved to November 1, and nothing could see it:
 * one was a sentence in a TypeScript file and the other was a timestamp in
 * Postgres, and no type, no test and no build step compared them. It was found
 * by reading. That is not a way to find it twice.
 *
 * November is the month this is easiest to get wrong. Daylight saving ends on
 * November 1 in 2026, so an instant that looks like November 2 in UTC is
 * November 1 in Alice, and the difference is a whole day of a deadline a
 * sponsor is being held to.
 *
 * Two halves:
 *
 *   1. The derivation. lib/race-dates is driven with the real column values and
 *      every string it produces is checked against what those instants actually
 *      are in America/Chicago. The expected strings are written out here rather
 *      than computed the same way the code computes them, because a check that
 *      recomputes the answer with the implementation under test proves nothing.
 *
 *   2. The hand written ones. Every file that prints race copy is read with its
 *      comments stripped and searched for a date or a time literal. There are
 *      supposed to be none: everything comes off a column now. The exceptions
 *      are listed below with a reason each, and the frozen sponsorship
 *      agreement is not an exception, it is checked against the column
 *      explicitly.
 *
 * Node and fs only, so it runs in the Vercel build like every other prebuild
 * gate.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');

/**
 * The live races row for turkey-trot-2026, as of 2026-10-22.
 *
 * Mirrored here on purpose. The build cannot read the database, so these are
 * the contract: change the row, change these, and the build will then tell you
 * every other thing that has to move with them. That is the entire point.
 */
const COLUMNS = {
  starts_at: '2026-11-14T14:00:00Z',
  registration_closes_at: '2026-11-14T13:00:00Z',
  shirt_deadline_at: '2026-11-03T05:59:59Z',
};

/**
 * What those instants are in Alice, written out.
 *
 * Independent of the code under test. If somebody changes a column these stop
 * matching and the build says so; if somebody changes a format string these
 * stop matching and the build says so. Either way it is deliberate.
 */
const EXPECTED = {
  startLong: 'Saturday, November 14, 2026',
  startShort: 'November 14',
  startWeekday: 'Saturday, November 14',
  startTime: '8:00 AM',
  checkInTime: '7:00 AM',
  shirtDeadlineLong: 'November 2, 2026',
  shirtDeadlineShort: 'November 2',
};

/* ------------------------------------------------------- the hand written */

/** Everything that prints race copy. */
const SOURCES = [
  'app/turkey-trot/page.tsx',
  'app/turkey-trot/registered/page.tsx',
  'app/turkey-trot/sponsors/page.tsx',
  'app/turkey-trot/sponsors/thanks/page.tsx',
  'components/TurkeyTrotBlock.tsx',
  'components/race/RaceRegistration.tsx',
  'components/race/SponsorForm.tsx',
  'components/race/RaceAdLoop.tsx',
  'lib/race-seo.ts',
  'lib/race.ts',
  'lib/race-dates.ts',
  'lib/email/race-confirmation.ts',
  'lib/email/race-alert.ts',
];

/**
 * The literals that are allowed to stay, and why.
 *
 * Two sentences, both about the food truck nights either side of the race.
 * Those are rows in `events`, not in `races`, and getEvents filters on
 * is_published, which is false for both while they are being got ready. There
 * is nothing readable to derive them from yet.
 *
 * This is a real exception rather than a convenient one, and it is narrow: the
 * exact strings, not the files. When those two events are published, read them
 * and delete these.
 */
const ALLOWED = [
  {
    text: 'Friday November 13 is packet pickup from 4 to 7 PM, with trucks and vendors open',
    why: 'the packet pickup event row is unpublished, so getEvents cannot see it',
  },
  {
    text: 'at 5:30 PM. Saturday November 14 trucks and vendors open at 6:00 AM, breakfast',
    why: 'the race morning event row is unpublished, so getEvents cannot see it',
  },
  {
    text: 'Two nights for vendors around it. Friday November 13 is packet pickup with trucks',
    why: 'the same two unpublished event rows, on the homepage block',
  },
  {
    text: 'and vendors open at 5:30 PM, and Saturday November 14 they open at 6:00 AM for',
    why: 'the same two unpublished event rows, on the homepage block',
  },
  {
    text: 'Entries for this year have closed. Come down anyway: the park is open from 6:00 AM',
    why: 'the race morning event opening, same unpublished row',
  },
  {
    text: 'Packet pickup is the Friday evening before, and again from 6:00 AM on race morning.',
    why: 'the same two unpublished event rows, in the FAQ answer',
  },
];

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';

/** A month and a day, or a clock time. The two shapes that can be wrong. */
const DATE_LIKE = new RegExp(`(?:${MONTHS})\\s+\\d{1,2}|\\b\\d{1,2}:\\d{2}\\s?(?:AM|PM)\\b`, 'g');

/** Comments are prose about the code and may name a date freely. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* --------------------------------------------------------------- compile */

function load(relative) {
  const abs = path.join(ROOT, relative);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const module = { exports: {} };
  new Function('exports', 'require', 'module', js)(module.exports, require, module);
  return module.exports;
}

/* ------------------------------------------------------------------- run */

const failures = [];

/* ---- 1. the derivation ---- */

const { raceDates } = load('lib/race-dates.ts');

const fixture = {
  startsAtISO: COLUMNS.starts_at,
  registrationClosesAtISO: COLUMNS.registration_closes_at,
  shirtDeadlineAtISO: COLUMNS.shirt_deadline_at,
};

const got = raceDates(fixture, Date.parse('2026-10-22T12:00:00Z'));

for (const [key, want] of Object.entries(EXPECTED)) {
  if (got[key] !== want) {
    failures.push(
      `lib/race-dates ${key} is "${got[key]}", expected "${want}".\n` +
        `    From ${describeColumn(key)}, resolved in America/Chicago.`
    );
  }
}

function describeColumn(key) {
  if (key.startsWith('shirt')) return `shirt_deadline_at ${COLUMNS.shirt_deadline_at}`;
  if (key === 'checkInTime') return `registration_closes_at ${COLUMNS.registration_closes_at}`;
  return `starts_at ${COLUMNS.starts_at}`;
}

/* ---- 2. the frozen agreement against the column ---- */

const agreementPath = 'lib/race-sponsorship/versions/sponsor-v0-1-draft-2026.ts';
const agreement = stripComments(fs.readFileSync(path.join(ROOT, agreementPath), 'utf8'));

/* The clause names the deadline in capitals. Only the clause is checked, not
   the whole file: the rest of it is prose about the race date, which is a
   different column. */
const clause = /SHIRT ORDER DEADLINE OF ([A-Z]+ \d{1,2}, \d{4})/.exec(agreement);

if (!clause) {
  failures.push(
    `${agreementPath}: the shirt deadline clause is missing or no longer names a date.\n` +
      '    It is the term a sponsor is held to and it has to be in the text.'
  );
} else if (clause[1] !== EXPECTED.shirtDeadlineLong.toUpperCase()) {
  failures.push(
    `${agreementPath}: the clause says ${clause[1]}, but shirt_deadline_at\n` +
      `    ${COLUMNS.shirt_deadline_at} is ${EXPECTED.shirtDeadlineLong} in America/Chicago.\n` +
      '    A sponsor is being held to a date the column does not hold.'
  );
}

/* ---- 3. nothing printed by hand ---- */

for (const relative of SOURCES) {
  const abs = path.join(ROOT, relative);
  if (!fs.existsSync(abs)) {
    failures.push(`${relative} is in the scan list and does not exist.`);
    continue;
  }

  const raw = fs.readFileSync(abs, 'utf8');
  const code = stripComments(raw);

  for (const match of code.matchAll(DATE_LIKE)) {
    const line = code.slice(0, match.index).split('\n').length;
    const text = code.split('\n')[line - 1]?.trim() ?? '';

    /* Allowed, by exact sentence rather than by file. */
    if (ALLOWED.some((a) => text.includes(a.text) || a.text.includes(text))) continue;

    failures.push(
      `${relative}:${line} prints "${match[0]}" by hand.\n` +
        `    ${text.slice(0, 100)}\n` +
        '    Derive it from the column through lib/race-dates instead.'
    );
  }
}

/* ---------------------------------------------------------------- report */

if (failures.length) {
  console.error('\ncheck-race-dates: FAILED\n');
  for (const f of failures) console.error('  ' + f + '\n');
  console.error(
    [
      'Every date and time the site prints for the race comes off a column in',
      'races, resolved in America/Chicago. If a column moved, update COLUMNS and',
      'EXPECTED in this file together and the build will tell you what else has',
      'to move with them.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.log(
  `check-race-dates: ${Object.keys(EXPECTED).length} printed dates and times match their ` +
    `columns in America/Chicago, the sponsorship clause names ${EXPECTED.shirtDeadlineLong} ` +
    `like shirt_deadline_at does, and ${SOURCES.length} source files print none by hand ` +
    `beyond the ${ALLOWED.length} unpublished event lines listed.`
);
