/**
 * The race waiver live on the site right now.
 *
 * Split from the registry the way lib/volunteer-waiver is: the registration
 * form is a client component, so anything it imports ships to the browser, and
 * it only ever needs the current text.
 *
 * Bumping the waiver means: add a file under versions/, point this at it, add
 * it to the registry. Never edit a version file in place.
 */
import currentDocument from './versions/race-v1-0-2026';
import { sectionCount, waiverParts } from './types';

export { currentDocument };
export type { WaiverBlock, WaiverDocument, WaiverPart } from './types';

export const RACE_WAIVER_VERSION = currentDocument.version;
export const RACE_WAIVER = currentDocument.blocks;
export const RACE_WAIVER_SECTION_COUNT = sectionCount(currentDocument);

/**
 * The three documents this instrument contains, each with its own anchor.
 *
 * The signing block renders one acknowledgment per part and links each
 * checkbox to its text, because each is executed on its own signature block in
 * the paper document rather than being one agreement in three chapters.
 */
export const RACE_WAIVER_PARTS = waiverParts(currentDocument);

/**
 * True while this text has not been through counsel.
 *
 * Read by the page, which puts a notice on screen. A runner signing something
 * Robert knows has not been reviewed should be able to see that; hiding it
 * would be the wrong kind of tidy.
 */
export const RACE_WAIVER_IS_DRAFT = currentDocument.isDraft;
