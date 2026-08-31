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
 * Scans the source of every template under lib/email. That is the whole surface
 * we write: a vendor's own business name can contain anything and is not ours
 * to police.
 *
 * Runs as part of prebuild, so a violation fails the build rather than the send.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'lib', 'email');

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

for (const file of fs.readdirSync(DIR).sort()) {
  if (!file.endsWith('.ts')) continue;

  const full = path.join(DIR, file);
  const source = fs.readFileSync(full, 'utf8');
  scanned += 1;

  for (const [char, name] of DASHES) {
    let at = source.indexOf(char);
    while (at !== -1) {
      failures.push(`lib/email/${file}:${lineOf(source, at)} contains a ${name}. Use a plain hyphen, a comma, or two sentences.`);
      at = source.indexOf(char, at + 1);
    }
  }

  for (let i = 0; i < source.length; ) {
    const cp = source.codePointAt(i);
    const width = cp > 0xffff ? 2 : 1;
    if (isEmoji(cp)) {
      failures.push(
        `lib/email/${file}:${lineOf(source, i)} contains an emoji (U+${cp.toString(16).toUpperCase()}). Transactional mail carries none.`
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

console.log(`check-email-copy: ${scanned} templates, no dashes beyond the hyphen, no emoji.`);
