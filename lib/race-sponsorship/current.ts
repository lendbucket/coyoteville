/**
 * The sponsorship agreement live on the site right now.
 *
 * Split from the registry because the sponsor form is a client component and
 * anything it imports ships to the browser. It only ever needs the current
 * text.
 *
 * Bumping it means: add a file under versions/, point this at it, add it to
 * the registry. Never edit a version file in place.
 */
import currentDocument from './versions/sponsor-v0-1-draft-2026';
import { sectionCount } from './types';

export { currentDocument };
export type { SponsorshipBlock, SponsorshipDocument } from './types';

export const SPONSORSHIP_VERSION = currentDocument.version;
export const SPONSORSHIP = currentDocument.blocks;
export const SPONSORSHIP_SECTION_COUNT = sectionCount(currentDocument);
export const SPONSORSHIP_IS_DRAFT = currentDocument.isDraft;
