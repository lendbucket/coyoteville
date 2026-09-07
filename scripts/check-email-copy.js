#!/usr/bin/env node
/**
 * Outgoing email copy: no dashes beyond the hyphen, and no emoji.
 *
 * A house style rule that is easy to state and easy to lose. An em dash arrives
 * by autocorrect, by a paste out of a document, or by a model writing the next
 * template, and nobody reads a 200 line HTML string closely enough to catch one.
 * Inboxes are also where the typography actually costs something: an em dash
 * renders as a box in a handful of older clients and Windows mail readers, and
 * an emoji in a subject line is what a filter is looking for.
 *
 * Scans the source of every template under lib/email, and every versioned legal
 * document under lib/fundraiser-terms/versions and lib/volunteer-waiver/versions.
 * That is the whole surface we write: a vendor's own business name can contain
 * anything and is not ours to police.
 *
 * The legal documents are in scope for a second reason on top of typography.
 * They are frozen: once somebody has signed a version it can never be edited,
 * so a stray en dash that arrives with a lawyer's marked up draft is permanent
 * in that version and gets copied into the next one. The cheapest moment to
 * catch it is the build before it ships, and this is that build.
 *
 * Runs as part of prebuild, so a violation fails the build rather than the send.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Every directory whose prose is ours and has to follow house style. */
const DIRS = [
  ['lib/email', 'template'],
  ['lib/fundraiser-terms/versions', 'terms version'],
  ['lib/volunteer-waiver/versions', 'waiver version'],
];

const DASHES = [
  ['‒', 'figure dash'],
  ['–', 'en dash'],
  ['—', 'em dash'],
  ['―', 'horizontal bar'],
  ['−', 'minus sign'],
];

/** Emoji and pictographs, plus the variation selector that makes one colour. */
function isEmoji(codePoint) {
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) || // pictographs, symbols, faces
    (codePoint >= 0x2600 && codePoint <= 0x27bf) || // misc symbols and dingbats
    codePoint === 0xfe0f || // variation selector 16
    (codePoint >= 0x1f000 && codePoint <= 0x1f0ff)
  );
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

const failures = [];
let scanned = 0;

const files = [];
for (const [dir] of DIRS) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) {
    failures.push(`${dir} does not exist, so its copy cannot be checked.`);
    continue;
  }
  for (const name of fs.readdirSync(full).sort()) {
    if (name.endsWith('.ts')) files.push([dir, name]);
  }
}

for (const [dir, file] of files) {
  const full = path.join(ROOT, dir, file);
  const source = fs.readFileSync(full, 'utf8');
  scanned += 1;

  for (const [char, name] of DASHES) {
    let at = source.indexOf(char);
    while (at !== -1) {
      failures.push(`${dir}/${file}:${lineOf(source, at)} contains a ${name}. Use a plain hyphen, a comma, or two sentences.`);
      at = source.indexOf(char, at + 1);
    }
  }

  for (let i = 0; i < source.length; ) {
    const cp = source.codePointAt(i);
    const width = cp > 0xffff ? 2 : 1;
    if (isEmoji(cp)) {
      failures.push(
        `${dir}/${file}:${lineOf(source, i)} contains an emoji (U+${cp.toString(16).toUpperCase()}). Our own copy carries none.`
      );
    }
    i += width;
  }
}

if (failures.length) {
  console.error('check-email-copy: FAILED');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

console.log(
  `check-email-copy: ${scanned} files across ${DIRS.length} directories, ` +
    'no dashes beyond the hyphen, no emoji.'
);
