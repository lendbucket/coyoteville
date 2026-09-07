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
import currentDocument from './versions/vol-v1-0-2026';
import { sectionCount } from './types';

export { currentDocument };
export type { WaiverBlock, WaiverDocument } from './types';

export const WAIVER_VERSION = currentDocument.version;
export const WAIVER = currentDocument.blocks;
export const WAIVER_SECTION_COUNT = sectionCount(currentDocument);

/* isDraft stays on the document type because vol-v0.1-DRAFT-2026 is frozen and
   carries it, but nothing renders a warning any more: the live waiver has been
   through counsel, and the page shows the version string instead. Anybody who
   puts an unreviewed version live again has to decide, deliberately, whether to
   put that notice back. */
