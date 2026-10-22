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

/**
 * The poster's real pixel size, read out of the file.
 *
 * The og:image width and height were written out by hand as 1080x1920, which
 * was true of the vertical cut and became wrong the moment the video was
 * replaced with a 16:9 one at 1280x720. Nothing would have noticed: social
 * cards would simply have been laid out to the wrong shape.
 *
 * So it is parsed instead. Only the two headers that matter are understood, PNG
 * and baseline or progressive JPEG, and anything unparseable returns null, in
 * which case the metadata omits the dimensions rather than claiming a shape.
 */
function imageSize(absolute: string): { width: number; height: number } | null {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(absolute);
  } catch {
    return null;
  }

  /* PNG: the IHDR chunk is always first, at a fixed offset. */
  if (buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  /* JPEG: walk the segments to a start of frame marker and read it. */
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buffer[i + 1];
      /* SOF0 through SOF15, skipping the four that are not frame headers. */
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

      if (isFrame) {
        return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }

  return null;
}

/** Null until the poster is in the repo, or if it cannot be parsed. */
export const POSTER_SIZE = HAS_POSTER
  ? imageSize(path.join(PUBLIC, 'video', 'turkey-trot-ad-poster.jpg'))
  : null;
