import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Which Turkey Trot assets are actually in the repo.
 *
 * The video, its poster and the logo are dropped in by hand rather than
 * generated, so there is a window where the page exists and the files do not.
 * A missing file is not a reason to hold the page back, but it is every reason
 * not to render a broken image into a hero or an og:image tag: a social card
 * pointing at a 404 is worse than one pointing at the ordinary site card.
 *
 * Checked at module load, which on a prerendered page is build time. When the
 * files land, the next build picks them up and the sections appear with no
 * code change.
 */

const PUBLIC = path.join(process.cwd(), 'public');

function present(relative: string): boolean {
  try {
    return fs.existsSync(path.join(PUBLIC, relative));
  } catch {
    return false;
  }
}

export const RACE_ASSETS = {
  video: '/video/turkey-trot-ad.mp4',
  poster: '/video/turkey-trot-ad-poster.jpg',
  logo: '/photos/turkey-trot-logo.png',
  /** The GPX the course map is drawn from. Commit 4 reads this. */
  course: '/course/turkey-trot-2026.gpx',
} as const;

export const HAS_VIDEO = present('video/turkey-trot-ad.mp4');
export const HAS_POSTER = present('video/turkey-trot-ad-poster.jpg');
export const HAS_LOGO = present('photos/turkey-trot-logo.png');
export const HAS_COURSE = present('course/turkey-trot-2026.gpx');
