#!/usr/bin/env node
'use strict';

/**
 * Is a runner's medical information still out of the file that gets printed?
 *
 * The runner sheet is downloaded, printed, and carried around a parking lot on
 * a clipboard. It gets put down on a folding table next to a box of shirts and
 * left there. Whoever picks it up reads every column on it.
 *
 * medical_notes is on the tracker row, where one person behind a password looks
 * at it on a phone, and it must never be in that CSV. The rule is written next
 * to the column in SCHEMA.md. This is the part that makes the rule hold when
 * somebody who has not read SCHEMA.md is asked to "add the medical column to
 * the runner export" and does exactly that.
 *
 * It does not pattern match the source for a word. It compiles lib/race-admin,
 * builds all three CSVs from a fixture runner carrying a distinctive medical
 * note, and reads the output. A column renamed, aliased, concatenated into
 * another field or interpolated into a cell is still caught, because what is
 * checked is the bytes that would land in the file.
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

/* The note the fixture runner carries. Distinctive so finding it anywhere in
   the output is unambiguous, and shaped like a real one. */
/**
 * What a leak of admin_notes would look like.
 *
 * It holds the payment link and checkout failure stamps, and it is written by
 * the tracker, so it is operational detail about a person that belongs behind
 * the password for the same reason the medical note does. Same sheet, same
 * parking lot table.
 */
const ADMIN_SECRET = 'ADMINNOTELEAK-Payment link sent 2026-11-05T18:22:00.000Z';

const SECRET = 'ASTHMA-CARRIES-INHALER-SEVERE-NUT-ALLERGY';

/* ------------------------------------------------------- compile the module */

/**
 * lib/race-admin imports server-only and the Supabase client. Neither is
 * reachable here and neither is needed: only the pure CSV builders are called.
 * So both are swapped for stubs while it loads.
 */
const originalLoad = Module._load;

Module._load = function patched(request, parent, isMain) {
  if (request === 'server-only') return {};
  if (request === '@/lib/supabase') {
    return {
      getSupabaseAdmin: () => {
        throw new Error('check-race-export does not touch the database');
      },
    };
  }
  if (request === '@/lib/race') return loadTs('lib/race.ts');
  if (request === '@/lib/race-notes') return loadTs('lib/race-notes.ts');
  if (request === './note-stamps') return loadTs('lib/note-stamps.ts');
  return originalLoad(request, parent, isMain);
};

function loadTs(relative) {
  const abs = path.join(root, relative);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const module = { exports: {} };
  const localRequire = (request) => Module._load(request, null, false);
  new Function('exports', 'require', 'module', js)(module.exports, localRequire, module);
  return module.exports;
}

const admin = loadTs('lib/race-admin.ts');

Module._load = originalLoad;

/* ---------------------------------------------------------------- a fixture */

/**
 * One runner, with every field filled in, including the three that are
 * sensitive: the medical note, and the emergency contact which IS supposed to
 * be on the sheet because that is the whole point of carrying it.
 */
const runner = {
  id: 'r1',
  groupId: null,
  firstName: 'Dana',
  lastName: 'Ybarra',
  email: 'dana@example.com',
  phone: '361-555-0101',
  ageOnRaceDay: 10,
  gender: 'F',
  city: 'Alice',
  state: 'TX',
  emergencyContactName: 'Rosa Ybarra',
  emergencyContactPhone: '361-555-0199',
  medicalNotes: SECRET,
  adminNotes: ADMIN_SECRET,
  payLinkSentAt: '2026-11-05T18:22:00.000Z',
  checkoutFailedAt: '2026-11-05T18:20:00.000Z',
  tier: 'adult',
  teamName: 'Coyote Pack',
  shirtSize: 'M',
  bibName: 'DANA',
  amountCents: 3000,
  paymentStatus: 'paid',
  bibNumber: 7,
  checkedInAt: '2026-11-14T12:10:00Z',
  shirtCollected: true,
  isMinor: true,
  guardianName: 'Rosa Ybarra',
  guardianRelationship: 'Mother',
  guardianPhone: '361-555-0177',
  guardianEmail: 'rosa@example.com',
  minorAccompaniedBy: 'Marta Delgado, aunt'
};

const view = {
  byTier: { adult: { registered: 1, paid: 1, unpaid: 0 }, total: { registered: 1, paid: 1, unpaid: 0 } },
  shirts: { M: 1 },
  shirtTotal: 1,
  runners: [runner],
  groups: [],
  sponsors: [
    {
      id: 's1',
      level: 'title',
      businessName: 'Example Feed and Supply',
      contactName: 'Sam Example',
      email: 'sam@example.com',
      amountCents: 150000,
      paymentStatus: 'paid',
      agreementVersion: 'sponsor-v0.1-DRAFT-2026',
      signedAt: '2026-10-20T15:00:00Z',
      publishedAt: null,
    },
  ],
  checkedIn: 1,
  bibbed: 1,
};

/* -------------------------------------------------------------------- check */

const failures = [];

const exports_ = [
  { name: 'runners', csv: admin.runnersCsv(view), headers: admin.RUNNER_EXPORT_HEADERS },
  { name: 'awards', csv: admin.awardsCsv(view), headers: admin.AWARD_EXPORT_HEADERS },
  { name: 'sponsors', csv: admin.sponsorsCsv(view), headers: admin.SPONSOR_EXPORT_HEADERS },
];

for (const { name, csv, headers } of exports_) {
  /* The note itself, anywhere in the bytes. */
  if (csv.includes(SECRET)) {
    const line = csv.split('\r\n').findIndex((l) => l.includes(SECRET)) + 1;
    failures.push(
      `the ${name} export contains the runner's medical note, on line ${line}.\n` +
        '    This file is printed and left on a table in a parking lot.\n' +
        '    medical_notes belongs on the tracker row and nowhere else.'
    );
  }

  if (csv.includes(ADMIN_SECRET)) {
    const line = csv.split('\r\n').findIndex((l) => l.includes(ADMIN_SECRET)) + 1;
    failures.push(
      `the ${name} export contains the row's admin notes, on line ${line}.\n` +
        '    admin_notes carries the payment link and checkout failure stamps.\n' +
        '    It belongs on the tracker row and nowhere else, same as the medical note.'
    );
  }

  /* And a column that announces itself, in case a future one is left empty in
     this fixture and so slips the check above. */
  const named = headers.find((h) => /medical|health|condition|allerg|admin.?note/i.test(h));
  if (named) {
    failures.push(`the ${name} export has a column called "${named}". See SCHEMA.md.`);
  }
}

/* The check is only worth anything if the fixture would have shown the note. */
if (!view.runners[0].medicalNotes) {
  failures.push('the fixture runner has no medical note, so this check proves nothing.');
}

if (!view.runners[0].adminNotes) {
  failures.push('the fixture runner has no admin notes, so that half of this check proves nothing.');
}

/* And the sheet has to still be useful: the emergency contact IS meant to be on
   it. A gate that passed by exporting nothing would be no good either. */
const runnersCsv = exports_[0].csv;
for (const required of [
  'Ybarra',
  'Rosa Ybarra',
  '361-555-0199',
  '7',
  /* The guardian's own contact, and the adult who will be on course with a
     runner under 12. If a ten year old is out there the person at the table
     needs both, and a sheet that silently dropped them would still have passed
     every other assertion here. */
  '361-555-0177',
  'rosa@example.com',
  'Marta Delgado, aunt',
]) {
  if (!runnersCsv.includes(required)) {
    failures.push(
      `the runner export is missing ${JSON.stringify(required)}.\n` +
        '    It has to carry the bib, the name and the emergency contact, or there\n' +
        '    is no reason to print it.'
    );
  }
}

if (failures.length) {
  console.error('\ncheck-race-export: FAILED\n');
  for (const f of failures) console.error('  ' + f + '\n');
  process.exit(1);
}

console.log(
  `check-race-export: ${exports_.length} exports built from a runner carrying both a medical ` +
    'note and admin notes, neither appears in any of them, and the runner sheet still carries ' +
    'the bib, the name and the emergency contact.'
);
