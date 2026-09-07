/**
 * The waiver live on the site right now.
 *
 * Split from the registry the way lib/agreement and lib/fundraiser-terms are:
 * the signing form is a client component, so anything it imports ships to the
 * browser, and it only ever needs the current text.
 *
 * Bumping the waiver means: add a file under versions/, point this at it, add
 * it to the registry. Never edit a version file in place.
 */
import currentDocument from './versions/vol-v0-1-draft-2026';
import { sectionCount } from './types';

export { currentDocument };
export type { WaiverBlock, WaiverDocument } from './types';

export const WAIVER_VERSION = currentDocument.version;
export const WAIVER = currentDocument.blocks;
export const WAIVER_IS_DRAFT = currentDocument.isDraft;
export const WAIVER_SECTION_COUNT = sectionCount(currentDocument);
