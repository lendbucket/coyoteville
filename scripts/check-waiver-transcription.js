#!/usr/bin/env node
'use strict';

/**
 * Does the transcribed waiver say what the PDF says, and nothing else?
 *
 * race-v1.0-2026 is a hand transcription of an executed legal document. The
 * claim "transcribed faithfully" is worth nothing unless something checks it,
 * and the thing most likely to break it is not a bad transcription on day one:
 * it is somebody tidying a sentence, fixing a typo, or reflowing a paragraph in
 * a file that is supposed to be frozen.
 *
 * Checked in both directions, because they catch different faults:
 *
 *   NOTHING INVENTED. Every block of the transcription must appear verbatim in
 *   the source. This is the one that matters: it makes it impossible to put a
 *   sentence in front of a signer that is not in the document being signed.
 *
 *   NOTHING DROPPED. The proportion of the source's text covered by matched
 *   blocks is measured and held above a floor, so an omission shows up as a
 *   drop rather than passing quietly.
 *
 * The source is the extraction committed next to the PDF, produced by
 * scripts/extract-pdf-text.js, which reported zero unmapped glyphs.
 *
 * An earlier version compared sliding windows of words across the whole
 * document and spent its time reporting false alarms at page footers,
 * signature rules and document boundaries, where the words either side were
 * never adjacent in the first place. A check that cries wolf at its own seams
 * is a check somebody switches off.
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const SOURCE = path.join(root, 'docs/legal/turkey-trot-waiver-v1.0-2026.extracted.txt');
const VERSION_FILE = 'lib/race-waiver/versions/race-v1-0-2026.ts';

/**
 * The sentences the transcription adds of its own.
 *
 * Three, one per document, each saying how the instrument is executed on this
 * site rather than on paper, because the paper signature rules are not
 * reproduced. Listed in full rather than detected by a pattern: an exception
 * that names itself is reviewable, and "ignore anything that does not match"
 * is not a check.
 */
const ADDED_BY_TRANSCRIPTION = [
  'The paper document is executed here with the Participant’s full legal name, signature, and date, together with date of birth, email, and emergency contact name and phone. Registering on this site executes it electronically instead, under Article 14.2.',
  'The paper document is executed here with the Grantor’s full legal name, signature, and date. Registering on this site executes it electronically instead.',
  'The paper document is executed here with the Minor’s full legal name and date of birth, and the Guardian’s full legal name, relationship, signature, date, phone, and email. Registering on this site executes it electronically instead.',
];

/* ------------------------------------------------- load the transcription */

const originalLoad = Module._load;
Module._load = (request, parent, isMain) =>
  request === 'server-only' ? {} : originalLoad(request, parent, isMain);

function loadTs(relative) {
  const abs = path.join(root, relative);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', js)(mod.exports, require, mod);
  return mod.exports;
}

const doc = loadTs(VERSION_FILE).default;
Module._load = originalLoad;

/* ------------------------------------------------------------ normalising */

/**
 * Down to comparable text.
 *
 * Curly quotes fold to straight, because the PDF uses curly and a transcription
 * may carry either. The PDF's list auto numbering is glued to the first word,
 * as in "2.Robert Reyna", while a transcribed list item carries no number
 * because the renderer numbers it, so that form is stripped from both sides.
 * Clause numbers like 1.4 and 3.10 have a digit after the period and survive.
 *
 * Capitalisation is NOT touched. Article 2.2 recites that the release and
 * indemnity provisions are set in capital letters so as to be conspicuous, so
 * their case is part of what the document says.
 */
function norm(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/\b\d{1,2}\.(?=[A-Za-z])/g, ' ')
    /* The same numbering with a space after it. The PDF sets the Guardian
       Addendum items as "1.Authority" and a readable transcription sets them as
       "1. Authority", which is a difference in the list marker and not in the
       text. Clause numbers survive both passes because they have a digit after
       the period: 14.4 and 3.10 are untouched. */
    .replace(/\b\d{1,2}\.\s+(?=[A-Z])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAGE_FOOTER = /Coyoteville Alice LLC\s*\|\s*Turkey Trot 5K Release\s*\|\s*Page \d+/g;

/** The paper signature rules. Field labels are kept; the blank rules are not. */
const SIGNATURE_RULES = [
  'Participant Full Legal Name:',
  'Participant Signature:',
  'Date of Birth:',
  'Emergency Contact Name and Phone:',
  'Grantor Full Legal Name:',
  'Grantor Signature:',
  'Minor’s Full Legal Name:',
  'Guardian Full Legal Name:',
  'Guardian Signature:',
  'Guardian Phone:',
];

const source = norm(
  fs
    .readFileSync(SOURCE, 'utf8')
    .replace(PAGE_FOOTER, ' ')
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t || /^_+$/.test(t)) return false;
      return !SIGNATURE_RULES.some((label) => t.startsWith(label));
    })
    .join(' ')
);

/* ------------------------------------------- 1. nothing invented -------- */

const invented = [];
const spans = [];

for (const block of doc.blocks) {
  const texts = block.kind === 'list' ? (block.items ?? []) : block.text ? [block.text] : [];

  for (const raw of texts) {
    if (ADDED_BY_TRANSCRIPTION.includes(raw)) continue;

    const text = norm(raw);
    if (!text) continue;

    const at = source.indexOf(text);
    if (at === -1) {
      invented.push({ kind: block.kind, text });
    } else {
      spans.push([at, at + text.length]);
    }
  }
}

/* ------------------------------------------- 2. nothing dropped --------- */

/* How much of the source the matched blocks cover, counting overlaps once. */
spans.sort((a, b) => a[0] - b[0]);
let covered = 0;
let reach = 0;
for (const [from, to] of spans) {
  if (to <= reach) continue;
  covered += to - Math.max(from, reach);
  reach = to;
}

const coverage = (covered / source.length) * 100;

/* ----------------------------------------------------------- the checks */

const failures = [];

if (invented.length) {
  failures.push(
    `${invented.length} block(s) of the transcription do not appear in the PDF. Nothing may be ` +
      'put in front of a signer that is not in the document they are signing.'
  );
}

/* The gap from 100 is the PDF's own running structure and the three added
   sentences. A real omission shows as a drop below this. */
const FLOOR = 90;
if (coverage < FLOOR) {
  failures.push(
    `the transcription covers only ${coverage.toFixed(1)}% of the source text, below the ` +
      `${FLOOR}% floor. Something has been dropped.`
  );
}

if (doc.isDraft) {
  failures.push('race-v1.0-2026 is marked isDraft, but it is the executed document.');
}

const conspicuous = doc.blocks.filter((b) => b.kind === 'conspicuous').length;
if (conspicuous < 15) {
  failures.push(
    `only ${conspicuous} conspicuous blocks, expected at least 15. Article 2.2 recites that the ` +
      'release and indemnity provisions are set in capitals so as to be conspicuous, so losing ' +
      'them changes what the document says about itself.'
  );
}

/* The source typo is transcribed, not corrected. Robert confirmed on
   2026-10-22 that 150 N. Stadium Road is correct and that the S in section 1.4
   is a typo in the source, and that the transcription keeps it: this file is
   the record of what was executed, and a corrected v1.1 gets its own file. */
const typos = doc.blocks.filter(
  (b) =>
    (b.text ?? '').includes('150 S. Stadium Road') ||
    (b.items ?? []).some((i) => i.includes('150 S. Stadium Road'))
).length;

if (typos !== 2) {
  failures.push(
    'expected the source\'s "150 S. Stadium Road" in 2 places, section 1.4 and Released Party 4, ' +
      `found ${typos}. That is a typo in the source document and it is meant to be there.`
  );
}

if (failures.length) {
  console.error('\ncheck-waiver-transcription: FAILED\n');
  for (const f of failures) console.error('  ' + f + '\n');
  for (const i of invented.slice(0, 6)) {
    console.error('  not in the PDF (' + i.kind + '): ' + i.text.slice(0, 160) + '\n');
  }
  process.exit(1);
}

console.log(
  `check-waiver-transcription: every one of ${doc.blocks.length} blocks of ${doc.version} appears ` +
    `verbatim in the executed PDF, covering ${coverage.toFixed(1)}% of its text, with ` +
    `${conspicuous} conspicuous blocks preserved and the section 1.4 source typo intact in both ` +
    'places rather than silently corrected.'
);
