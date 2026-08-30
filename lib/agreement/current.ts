/**
 * The version of the agreement that is live on the site right now.
 *
 * Split out from the registry on purpose. The signing page is a client
 * component, so anything it imports ships to the browser, and it only ever
 * needs the current text. The registry holds every historical version and is
 * server only, which keeps a hundred kilobytes of superseded legal prose out of
 * the bundle a vendor downloads to fill in a form.
 *
 * Bumping the agreement means: add a new file under versions/, point this at
 * it, and add it to the registry. Never edit a version file in place.
 */
import currentDocument from './versions/v5-0-2026';
import { sectionCount } from './types';

export { currentDocument };

export const AGREEMENT_VERSION = currentDocument.version;

/**
 * How many numbered sections the agreement has. The form tells the vendor to
 * read all of them and says the number out loud, in two places, so it is
 * counted from the text rather than typed in as a literal that goes stale the
 * next time a section is added.
 */
export const AGREEMENT_SECTION_COUNT = sectionCount(currentDocument);

export const CONTRACTING_ENTITY = 'Coyoteville Alice LLC';
export const CONTRACTING_ENTITY_FULL =
  'Coyoteville Alice LLC, a Texas limited liability company';
export const AUTHORIZED_SIGNER = 'Robert Reyna, Chief Executive Officer';
export const ENTITY_ADDRESS = '150 North Stadium Road, Alice, Texas 78332';
