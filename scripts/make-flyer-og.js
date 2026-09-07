#!/usr/bin/env node
'use strict';

/**
 * Crop the portrait flyer into a 1200x630 landscape card for og:image.
 *
 * The flyer is a tall sheet of paper. Every social preview is a wide rectangle,
 * and the default centre crop of a portrait image throws away the top and the
 * bottom, which on this flyer is the headline and the call to action. What has
 * to survive is the football and the line across it that says 50 percent,
 * because that number is the entire reason anybody clicks.
 *
 * So the crop is anchored on a band around the middle of the sheet rather than
 * on its geometric centre, and the band is expressed as a fraction of the
 * height so it follows a re-export of the flyer at any resolution.
 *
 * Run it by hand after the flyer changes:
 *
 *   node scripts/make-flyer-og.js
 *
 * Not part of the build. The output is committed, the way the other images in
 * public are, so a deploy never depends on re-encoding a source file that may
 * not be there.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const SOURCE = path.join(root, 'public', 'photos', 'parking-fundraiser.png');
const OUT = path.join(root, 'public', 'photos', 'parking-fundraiser-og.jpg');

/** Card size every platform crops to. */
const W = 1200;
const H = 630;

/**
 * Where the middle of the crop sits, as a fraction down the sheet.
 *
 * 0.5 is the geometric centre. The flyer's football and its 50 percent line sit
 * a little above that, under the headline, so the window is pulled up. Adjust
 * this one number if a re-drawn flyer moves them.
 */
const FOCUS = 0.44;

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(
      [
        '',
        'make-flyer-og: the flyer is not in the repo.',
        '',
        `  expected: ${path.relative(root, SOURCE).split(path.sep).join('/')}`,
        '',
        'Drop the flyer there and run this again. Nothing else needs to change:',
        'the page and the metadata both pick the crop up once it exists.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  const image = sharp(SOURCE);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (!width || !height) {
    console.error('make-flyer-og: could not read the flyer dimensions.');
    process.exit(1);
  }

  /* The widest band of the sheet that is 1200x630 in proportion. On a portrait
     source that is the full width and a short slice of the height. */
  const bandHeight = Math.min(height, Math.round((width * H) / W));
  const bandWidth = Math.round((bandHeight * W) / H);

  const left = Math.max(0, Math.min(width - bandWidth, Math.round((width - bandWidth) / 2)));
  const top = Math.max(
    0,
    Math.min(height - bandHeight, Math.round(height * FOCUS - bandHeight / 2))
  );

  await image
    .extract({ left, top, width: bandWidth, height: bandHeight })
    .resize(W, H, { fit: 'cover' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(OUT);

  const bytes = fs.statSync(OUT).size;
  console.log(
    `make-flyer-og: ${width}x${height} -> ${W}x${H}, ` +
      `window ${bandWidth}x${bandHeight} at ${left},${top} (focus ${FOCUS}), ` +
      `${(bytes / 1024).toFixed(1)} kB.`
  );

  /* The page needs the flyer's real dimensions for width and height, or the
     browser reserves the wrong box and the layout shifts when it loads. Printed
     rather than guessed, because only this script has ever seen the file. */
  console.log(
    [
      '',
      'Paste these into lib/parking-fundraiser.ts:',
      '',
      '  export const FLYER_AVAILABLE = true;',
      `  export const FLYER_WIDTH = ${width};`,
      `  export const FLYER_HEIGHT = ${height};`,
      '',
    ].join(String.fromCharCode(10))
  );
}

main().catch((err) => {
  console.error('make-flyer-og failed:', err.message);
  process.exit(1);
});
