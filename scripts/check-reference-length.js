#!/usr/bin/env node
'use strict';

/**
 * Does every referenceId this code can build fit in Square's 40 characters?
 *
 * Square enforces a 40 character limit on order.reference_id and rejects the
 * whole payment-links call with INVALID_REQUEST_ERROR / VALUE_TOO_LONG. The
 * row is written before the link is created, so a reference one character too
 * long does not degrade: the runner gets an unpaid registration and never
 * reaches checkout.
 *
 * That shipped. Every gate was green while nobody could register, because
 * nothing here measured the one thing Square actually enforces. Building a
 * reference and counting its characters is three lines, and it would have
 * failed the build instead of the checkout.
 *
 * Every kind is built from a real UUID and measured. Not a sample of them, and
 * not the short ones: the longest realistic input for each shape, because the
 * limit is only ever hit by the longest one.
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

/** What Square allows. Not a guess: it is what the API rejected us for. */
const LIMIT = 40;

/* --------------------------------------------------------------- compile */

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'server-only') return {};
  /* The builders need neither Square nor the site config to make a string. */
  if (request === './square' || request === '@/lib/square') {
    return {
      getSquare: () => {
        throw new Error('not needed');
      },
      getSquareLocationId: () => 'LOC',
      isSquareConfigured: () => false,
    };
  }
  if (request === './supabase' || request === '@/lib/supabase') {
    return { getSupabaseAdmin: () => ({}), isSupabaseConfigured: () => false };
  }
  if (/mailer|email|resend/i.test(request)) {
    return new Proxy({}, { get: () => async () => undefined });
  }
  if (request.startsWith('./') || request.startsWith('@/lib/')) {
    /* Anything else a module reaches for on the way in. A reference builder
       is a string function; nothing it needs is here. */
    try {
      return originalLoad(request, parent, isMain);
    } catch {
      return new Proxy({}, { get: () => () => undefined });
    }
  }
  if (request === './seo' || request === '@/lib/seo') {
    return { SITE_URL: 'https://coyoteville.com' };
  }
  return originalLoad(request, parent, isMain);
};

function loadTs(relative) {
  const abs = path.join(root, relative);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', js)(mod.exports, require, mod);
  return mod.exports;
}

const race = loadTs('lib/race-payment-link.ts');
const parking = (() => {
  try {
    return loadTs('lib/parking.ts');
  } catch {
    return null;
  }
})();

Module._load = originalLoad;

/* ------------------------------------------------------------- the cases */

/**
 * A real UUID, and the longest race slug plausibly in play.
 *
 * The slug is here because the shapes that still accept one have to be
 * measured with a long one. A reference that fits for "turkey-trot-2026" and
 * not for next year's longer name is the same bug with a later date on it.
 */
const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const LONG_SLUG = 'coyoteville-thanksgiving-turkey-trot-2027';

const cases = [];

for (const [name, build] of [
  ['race registration', race.raceReferenceId],
  ['race group', race.raceGroupReferenceId],
  ['race sponsor', race.raceSponsorReferenceId],
]) {
  if (typeof build !== 'function') continue;

  /* Built with a long slug on purpose. If the builder still uses it, the
     length will say so. */
  for (const [label, slug] of [
    ['current slug', 'turkey-trot-2026'],
    ['a longer slug', LONG_SLUG],
  ]) {
    let value;
    try {
      value = build(slug, UUID);
    } catch (err) {
      cases.push({ name: `${name} (${label})`, error: String(err.message || err) });
      continue;
    }
    cases.push({ name: `${name} (${label})`, value });
  }
}

/* parking: and donation:, measured against the event slugs they are actually
   used with.

   These are NOT changed by this commit and they are not failed by it either:
   they are correct for the game night slugs they were written for. They are
   measured and printed so the numbers are on the record, because against the
   two Turkey Trot event slugs they are 43 to 50 characters and would be
   rejected by Square exactly as the race references were. That is reported to
   Robert rather than fixed here, because parking is a working money path and
   changing its reference shape is not a thing to do in an urgent fix. */
const EVENT_SLUGS = [
  'turkey-trot-packet-pickup-2026-11-13',
  'turkey-trot-race-morning-2026-11-14',
];

const parkingNotes = [];
if (parking) {
  for (const slug of EVENT_SLUGS) {
    for (const [name, fn, args] of [
      ['parking', parking.parkingReferenceId, [slug]],
      ['donation', parking.donationReferenceId, [slug, 1000]],
    ]) {
      if (typeof fn !== 'function') continue;
      const value = fn(...args);
      parkingNotes.push({ name, value, over: value.length > LIMIT });
    }
  }
}

/* ---------------------------------------------------------------- check */

const failures = [];

if (!cases.length) {
  failures.push('no reference builders were found, so nothing was measured.');
}

for (const c of cases) {
  if (c.error) {
    failures.push(`${c.name}: builder threw: ${c.error}`);
    continue;
  }
  if (c.value.length > LIMIT) {
    failures.push(
      `${c.name} is ${c.value.length} characters, over Square's ${LIMIT}.\n` +
        `    ${c.value}\n` +
        '    Square rejects the payment-links call outright, and the row is already\n' +
        '    written by then, so the runner gets an unpaid registration and no\n' +
        '    checkout.'
    );
  }
}

/* A reference that round trips, so shortening it cannot quietly break the
   webhook's ability to find the row again. */
if (typeof race.raceFromReference === 'function' && typeof race.raceReferenceId === 'function') {
  for (const [kind, build] of [
    ['registration', race.raceReferenceId],
    ['group', race.raceGroupReferenceId],
    ['sponsor', race.raceSponsorReferenceId],
  ]) {
    if (typeof build !== 'function') continue;
    const ref = build('turkey-trot-2026', UUID);
    const back = race.raceFromReference(ref);
    if (!back || back.kind !== kind || back.id !== UUID) {
      failures.push(
        `${kind}: ${ref} does not read back to the same row ` +
          `(got ${back ? back.kind + ' ' + back.id : 'null'}).`
      );
    }
  }
}

if (failures.length) {
  console.error('\ncheck-reference-length: FAILED\n');
  for (const f of failures) console.error('  ' + f + '\n');
  process.exit(1);
}

const widest = cases.reduce((a, c) => Math.max(a, c.value.length), 0);

console.log(
  `check-reference-length: ${cases.length} race reference shapes built from a real UUID, ` +
    `longest is ${widest} of Square's ${LIMIT} characters, and each reads back to the row ` +
    'it names.'
);

if (parkingNotes.length) {
  const over = parkingNotes.filter((n) => n.over);
  console.log(
    '  parking and donation, measured not enforced: ' +
      parkingNotes.map((n) => n.value.length).join(', ') +
      ' characters' +
      (over.length
        ? '. ' + over.length + ' of them exceed ' + LIMIT + ' against the Turkey Trot event slugs:'
        : '.')
  );
  for (const n of over) console.log('    ' + n.value.length + '  ' + n.value);
}
