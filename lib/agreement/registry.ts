import 'server-only';
import type { AgreementDocument } from './types';
import v1 from './versions/v1-0-0-2026-08-23';
import v2 from './versions/v2-0-2026';
import v3_0 from './versions/v3-0-2026';
import v3_1 from './versions/v3-1-2026';
import v4 from './versions/v4-0-2026';
import v5 from './versions/v5-0-2026';

/**
 * Every version of the agreement anyone has ever signed here.
 *
 * A signed row stores the version it agreed to, and this is what that string
 * resolves against. Nothing is ever removed: the day a v3.0 vendor disputes
 * something is the day the v3.0 text has to still exist, and by then the site
 * will be several versions past it.
 *
 * The counterparty travels with the version rather than being read from the
 * current constants, because it is not the same counterparty throughout.
 * v2.0-2026 was signed with Reyna Title LLC d/b/a Coyoteville; everything from
 * v3.0-2026 on is Coyoteville Alice LLC. Printing today's entity on a v2
 * agreement would put the wrong company's name on a legal record, which is the
 * one thing this file exists to prevent.
 */
export type AgreementVersionRecord = {
  version: string;
  document: AgreementDocument;
  /** The contracting entity as it stood while this version was live. */
  entity: string;
  entityAddress: string;
  /**
   * The counterparty signature block this version carried. Null where the
   * version had none, which is the case for the original waiver: it named
   * Coyoteville in the recital and was never countersigned, and inventing a
   * signature block for it after the fact would misstate the record.
   */
  signer: { name: string; title: string } | null;
  /** Shown on the PDF wherever the record differs from the entity today. */
  note?: string;
};

const RECORDS: AgreementVersionRecord[] = [
  {
    version: v1.version,
    document: v1,
    entity: 'Coyoteville',
    entityAddress: '150 N. Stadium Road, Alice, Texas 78332',
    signer: null,
    note:
      'This version of the agreement named Coyoteville without identifying a contracting entity and carried no counterparty signature block. It is reproduced here as it was presented and signed.',
  },
  {
    version: v2.version,
    document: v2,
    entity: 'Reyna Title LLC d/b/a Coyoteville',
    entityAddress: '150 North Stadium Road, Alice, Texas 78332',
    signer: { name: 'Robert Reyna', title: 'Authorized Signer' },
    note:
      'This version was contracted with Reyna Title LLC d/b/a Coyoteville. The contracting entity changed to Coyoteville Alice LLC at v3.0-2026, which is why this agreement names a different counterparty from the current one.',
  },
  {
    version: v3_0.version,
    document: v3_0,
    entity: 'Coyoteville Alice LLC, a Texas limited liability company',
    entityAddress: '150 North Stadium Road, Alice, Texas 78332',
    signer: { name: 'Robert Reyna', title: 'Chief Executive Officer' },
  },
  {
    version: v3_1.version,
    document: v3_1,
    entity: 'Coyoteville Alice LLC, a Texas limited liability company',
    entityAddress: '150 North Stadium Road, Alice, Texas 78332',
    signer: { name: 'Robert Reyna', title: 'Chief Executive Officer' },
  },
  {
    version: v4.version,
    document: v4,
    entity: 'Coyoteville Alice LLC, a Texas limited liability company',
    entityAddress: '150 North Stadium Road, Alice, Texas 78332',
    signer: { name: 'Robert Reyna', title: 'Chief Executive Officer' },
  },
  {
    version: v5.version,
    document: v5,
    entity: 'Coyoteville Alice LLC, a Texas limited liability company',
    entityAddress: '150 North Stadium Road, Alice, Texas 78332',
    signer: { name: 'Robert Reyna', title: 'Chief Executive Officer' },
  },
];

const BY_VERSION = new Map(RECORDS.map((record) => [record.version, record]));

export const AGREEMENT_VERSIONS = RECORDS;

/**
 * The version a signed row points at, or null when the string is one this
 * codebase has never issued.
 *
 * Null is a real answer and callers have to handle it rather than falling back
 * to the current version. Serving today's text under yesterday's version string
 * would produce a document that looks authoritative and is wrong, which is
 * worse for the purpose these PDFs exist for than refusing to produce one.
 */
export function getAgreementVersion(version: string | null): AgreementVersionRecord | null {
  if (!version) return null;
  return BY_VERSION.get(version) ?? null;
}
