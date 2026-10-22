#!/usr/bin/env node
'use strict';

/**
 * Is the waiver text out of the client bundle?
 *
 * The three documents are forty thousand characters of static legal text with
 * no state, no handlers and nothing that re-renders them. They belong in the
 * HTML. For one commit they lived inside RaceRegistration, which carries a
 * 'use client' boundary because it owns the form state, and everything a client
 * component imports is serialized: /turkey-trot went from 9.49 kB of page JS to
 * 21.6 kB, and 96.8 kB of first load to 109 kB.
 *
 * The number is not the assertion. A number can come back down for the wrong
 * reason, and the two obvious wrong fixes both leave the text in the payload:
 * passing the rendered documents to the client component as children, or as a
 * prop, moves the same bytes from the bundle into the flight payload.
 *
 * So this looks for the text itself. Distinctive sentences from each of the
 * three documents are searched for in every JavaScript file the browser is
 * served. Finding one means the instrument is crossing the boundary again,
 * whatever the page JS figure says.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const CHUNKS = path.join(root, '.next', 'static');

/**
 * One phrase per document, each long enough to be unambiguous and each from a
 * different part of the instrument, so a partial leak is caught too.
 *
 * Taken from the executed text rather than invented, and deliberately not the
 * headings: a heading could legitimately appear in a client component as a
 * label, while these sentences could only be there because the body came with
 * them.
 */
const PHRASES = [
  /* Participant Agreement, Article 3.2. */
  'being struck by a motor vehicle can cause catastrophic injury or death',
  /* Participant Agreement, Article 4.1, a conspicuous block. */
  'HEREBY FULLY, FINALLY, AND FOREVER RELEASES, WAIVES',
  /* Media Release, section 2.1. */
  'SUBLICENSABLE, AND TRANSFERABLE RIGHT AND LICENSE',
  /* Guardian Addendum, item 7. */
  'must be accompanied on the course at all times by',
  /* Definitions, 1.7, the longest sentence in the document. */
  'negligent course design, negligent traffic control',
];

if (!fs.existsSync(CHUNKS)) {
  console.log('check-waiver-not-bundled: no build output, skipping.');
  process.exit(0);
}

/** Every JavaScript file the browser is served. */
function jsFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      out.push(...jsFiles(full));
    } else if (name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/* ------------------------------------------- the architectural rule ------

   No client component may reach the waiver library at all.

   This is the check with teeth, and it is a source check rather than an
   output one. Importing the documents into a client component shows up in the
   bundle below. Being handed them as children or as a prop does not: the page
   JS figure stays exactly where it was, because the bytes come from the
   server either way, and only the import graph says whether a client
   component is holding forty thousand characters of legal text.

   So: a file carrying 'use client' may not import lib/race-waiver, and may
   not take a prop that carries blocks. The version string is fine, and is
   what RaceRegistration takes. */

const CLIENT_DIRS = ['components', 'app'];

function sourceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const leaks = [];

for (const dir of CLIENT_DIRS) {
  for (const file of sourceFiles(path.join(root, dir))) {
    const body = fs.readFileSync(file, 'utf8');
    if (!/^\s*['"]use client['"]/m.test(body)) continue;

    const rel = path.relative(root, file).split(path.sep).join('/');

    /* The version string is a short constant and is allowed. The document
       text is not. */
    for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*race-waiver[^'"]*)['"]/g)) {
      const named = m[1].split(',').map((x) => x.trim()).filter(Boolean);
      const heavy = named.filter((n) => n !== 'RACE_WAIVER_VERSION');
      if (heavy.length) {
        leaks.push(`${rel} is a client component and imports ${heavy.join(', ')} from ${m[2]}`);
      }
    }

    /* A prop shaped like the document.

       Scoped by directory. Scoping by whether the file mentions the race
       waiver was the first attempt and it defeated itself: a client component
       handed the documents as a prop does not import them, so it mentions
       nothing, so the rule could not fire on the one file it exists for.

       components/VolunteerWaiverForm.tsx takes the volunteer waiver's blocks
       as a prop and has since it was written. That is the same problem in a
       different document, about 22 kB of version files, and it is a separate
       question reported rather than quietly swept in here. */
    const inRaceFlow = rel.startsWith('components/race/') || /race-waiver|RACE_WAIVER/.test(body);

    const blocksProp = new RegExp(
      '(?:docs|blocks|waiver|documents)\\s*:\\s*(?:readonly\\s*)?(?:WaiverBlock|\\{)'
    );

    if (inRaceFlow && blocksProp.test(body)) {
      leaks.push(`${rel} is a client component and takes a prop carrying waiver blocks`);
    }
  }
}

const files = jsFiles(CHUNKS);
const hits = [];

for (const file of files) {
  const body = fs.readFileSync(file, 'utf8');
  for (const phrase of PHRASES) {
    if (body.includes(phrase)) {
      hits.push({
        file: path.relative(root, file).split(path.sep).join('/'),
        phrase,
      });
    }
  }
}

/* The flight payload is NOT checked here.

   It only exists in a live response: with a database configured /turkey-trot is
   a dynamic route, so there is no prerendered HTML on disk to read. A first
   version of this gate looked for a turkey-trot.html that was not there, found
   nothing, and passed. Handing the documents to the client component as a prop
   sailed straight through it: the page JS figure stayed at 7 kB because the
   text came from the server, while every byte of it went into the payload
   instead.

   That half lives in check-race-pages now, which builds against a fixture and
   serves the page, so it can read what the browser is actually sent. */

if (hits.length || leaks.length) {
  console.error('\ncheck-waiver-not-bundled: FAILED\n');

  for (const l of leaks) console.error('  ' + l + '\n');

  for (const h of hits) {
    console.error(`  ${h.file}\n    contains: ${h.phrase}\n`);
  }

  console.error(
    [
      'The documents must be rendered by the server, as a sibling of the signing',
      'block and outside any client boundary. The signing block owns the',
      'checkboxes, the typed name and the button, and reaches the text by anchor.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.log(
  `check-waiver-not-bundled: none of ${PHRASES.length} phrases from the three documents appears ` +
    `in any of ${files.length} client JavaScript files, and no client component imports the ` +
    `documents or takes them as a prop. The flight payload is deliberately not checked: ` +
    `the App Router serializes the whole server tree into it, so it cannot tell a leak from ` +
    `correct rendering.`
);
