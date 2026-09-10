/**
 * The terms live on the site right now.
 *
 * Split from the registry the way lib/agreement does it, and for the same
 * reason: the application form is a client component, so anything it imports
 * ships to the browser. It only ever needs the current text. The registry holds
 * every version ever signed and is server only, which keeps superseded legal
 * prose out of the bundle an organization downloads to fill in a form.
 *
 * Changing the terms means: add a file under versions/, point this at it, add
 * it to the registry. Never edit a version file in place.
 */
import currentDocument from './versions/fundraiser-v1-2-2026';
import { sectionCount } from './types';

export { currentDocument };
export type { TermsBlock, TermsDocument } from './types';

export const TERMS_VERSION = currentDocument.version;
export const TERMS = currentDocument.blocks;
export const TERMS_SECTION_COUNT = sectionCount(currentDocument);
