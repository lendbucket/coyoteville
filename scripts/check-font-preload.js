#!/usr/bin/env node
/**
 * The hand written font preloads in app/layout.tsx still point at real files.
 *
 * next/font names its output by the hash of the font file, and next/font's own
 * preloading is not working on this build (next-font-manifest.json comes out
 * empty), so those two hrefs are written by hand. A hash that moves without the
 * layout moving with it is silent in every other check: the build passes, the
 * page renders, and the browser fetches a 404 at high priority while the real
 * face waits behind the stylesheet. Strictly worse than not preloading at all.
 *
 * So each preloaded href has to satisfy three things:
 *
 *   1. the file exists in the build output
 *   2. some emitted @font-face actually points at it, so we never preload a
 *      file nothing uses
 *   3. that @font-face is one of the two faces we meant to preload, and covers
 *      the basic latin range, which is the subset an English page needs
 *
 * Runs postbuild, against the real .next output.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LAYOUT = path.join(ROOT, 'app/layout.tsx');
const CSS_DIR = path.join(ROOT, '.next/static/css');

/** family regex, weight, human name. Keep in step with the layout's comment. */
const INTENDED = [
  [/Anton/, '400', 'Anton 400'],
  [/Barlow_Condensed/, '700', 'Barlow Condensed 700'],
];

const failures = [];

const layout = fs.readFileSync(LAYOUT, 'utf8');
const block = layout.match(/const PRELOAD_FONTS = \[([\s\S]*?)\];/);
if (!block) {
  console.error('check-font-preload: FAILED\n  could not find PRELOAD_FONTS in app/layout.tsx');
  process.exit(1);
}
const hrefs = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

if (!hrefs.length) {
  console.error('check-font-preload: FAILED\n  PRELOAD_FONTS is empty');
  process.exit(1);
}

/* Every @font-face in the build, indexed by the file it points at. */
const faces = new Map();
if (!fs.existsSync(CSS_DIR)) {
  console.error('check-font-preload: FAILED\n  no .next/static/css; run a build first');
  process.exit(1);
}
for (const name of fs.readdirSync(CSS_DIR)) {
  if (!name.endsWith('.css')) continue;
  const css = fs.readFileSync(path.join(CSS_DIR, name), 'utf8');
  for (const m of css.matchAll(/@font-face\{([^}]*)\}/g)) {
    const body = m[1];
    const url = (body.match(/url\(([^)]*)\)/) || [])[1];
    if (!url) continue;
    faces.set(url, {
      family: (body.match(/font-family:([^;]*)/) || [])[1] || '',
      weight: ((body.match(/font-weight:([^;]*)/) || [])[1] || '400').trim(),
      range: (body.match(/unicode-range:([^;]*)/) || [])[1] || '',
    });
  }
}

const matched = new Set();

for (const href of hrefs) {
  const onDisk = path.join(ROOT, '.next', href.replace(/^\/_next/, ''));

  if (!fs.existsSync(onDisk)) {
    failures.push(`${href} is preloaded but no such file was emitted. The font hash moved; read the new one out of the built CSS and update PRELOAD_FONTS.`);
    continue;
  }

  const face = faces.get(href);
  if (!face) {
    failures.push(`${href} exists but no @font-face in the build references it, so preloading it downloads a file nothing will use.`);
    continue;
  }

  const intended = INTENDED.find(([fam, weight]) => fam.test(face.family) && face.weight === weight);
  if (!intended) {
    failures.push(
      `${href} is ${face.family.trim()} weight ${face.weight}, which is not one of the two above-the-fold faces. Preloading a face that paints further down competes with the LCP image.`
    );
    continue;
  }

  if (!face.range.startsWith('u+00??')) {
    failures.push(
      `${href} is the ${face.range.trim().slice(0, 24)} subset of ${intended[2]}, not basic latin. That subset is not needed to paint an English page.`
    );
    continue;
  }

  matched.add(intended[2]);
}

for (const [, , name] of INTENDED) {
  if (!matched.has(name)) failures.push(`${name} is meant to be preloaded and nothing in PRELOAD_FONTS resolves to it.`);
}

if (failures.length) {
  console.error('check-font-preload: FAILED');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

const bytes = hrefs.reduce(
  (n, h) => n + fs.statSync(path.join(ROOT, '.next', h.replace(/^\/_next/, ''))).size,
  0
);
console.log(
  `check-font-preload: ${hrefs.length} preloads, ${[...matched].join(' and ')}, ${bytes} bytes, each basic latin and referenced by a real @font-face.`
);
