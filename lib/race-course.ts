import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from '@/lib/race-assets';

/**
 * The course map, read off disk and inlined.
 *
 * Inlined rather than put in an img tag, and the reason is not performance.
 * The animation that draws the route is CSS inside the file and the reduced
 * motion handling is a media query inside the file. An img tag is a document
 * boundary: the SVG inside one does not run page CSS, is not reached by the
 * page's media queries, and in several browsers does not animate at all. The
 * route would simply never draw and the reduced motion rule would never apply
 * to anybody who needs it.
 *
 * Saving the request is a second reason and a real one. This is the page people
 * open in a parking lot on a phone, and the map is the thing they came for.
 *
 * Read at module scope, which on a prerendered page is build time, the same way
 * the lot map is read for the spot emails. That means the file has to be in the
 * function bundle: see the outputFileTracingIncludes entry for /turkey-trot in
 * next.config.js. This page is ISR, so it is rendered by a serverless function
 * on revalidation and a file that was not traced is a file that is not there.
 * That has now gone wrong twice on this site, with the pdfkit standard fonts
 * and with the lot map, and check-traced-assets exists so it cannot be three.
 */

const COURSE_SVG = path.join(process.cwd(), 'public', 'course', 'turkey-trot-course.svg');

/** The PNG, for a social card. Not read, only pointed at. */
export const COURSE_PNG = '/course/turkey-trot-course.png';

function read(): string | null {
  try {
    const markup = fs.readFileSync(COURSE_SVG, 'utf8');
    /* An empty or truncated file is not a map. Better to fall back to the
       placeholder than to inline half an SVG into the page. */
    return markup.includes('</svg>') ? markup : null;
  } catch {
    return null;
  }
}

/**
 * The markup, or null when the file is not in the repo yet.
 *
 * Null is a real answer and the page renders its placeholder for it, the same
 * way the ad renders nothing without its video.
 */
export const COURSE_MAP: string | null = read();

export const HAS_COURSE_MAP = COURSE_MAP !== null;

/**
 * The PNG's real size, for the social card.
 *
 * Parsed rather than written down. The og:image dimensions were hand typed
 * once already and went wrong silently when the asset behind them changed.
 */
export const COURSE_PNG_SIZE = (() => {
  try {
    const abs = path.join(process.cwd(), 'public', 'course', 'turkey-trot-course.png');
    return fs.existsSync(abs) ? imageSize(abs) : null;
  } catch {
    return null;
  }
})();

/** True when the PNG is there to be used as a social card. */
export const HAS_COURSE_PNG = (() => {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'course', 'turkey-trot-course.png'));
  } catch {
    return false;
  }
})();
