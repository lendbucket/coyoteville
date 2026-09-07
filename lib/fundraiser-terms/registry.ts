import 'server-only';
import type { TermsDocument } from './types';
import v1_0 from './versions/fnf-v1-0-2026';
import v1_1 from './versions/fundraiser-v1-1-2026';

/**
 * Every version of the program terms anybody has ever signed.
 *
 * An org_applications row stores terms_version, and this is what that string
 * resolves against. Nothing is ever removed.
 *
 * This directory exists because it did not. The program was renamed from Friday
 * Night Fund to Parking Fundraiser, the name appears inside the terms, and the
 * text changed under rows that had already signed the old wording. There was no
 * versions directory to put the old text in, so for one commit those rows named
 * a version whose text was only in git history. The vendor agreement has worked
 * this way since v1 and the terms now do too.
 */
const RECORDS: TermsDocument[] = [v1_0, v1_1];

const BY_VERSION = new Map(RECORDS.map((doc) => [doc.version, doc]));

export const TERMS_VERSIONS = RECORDS;

/**
 * The text a signed row points at, or null when the string is one this codebase
 * has never issued.
 *
 * Null is a real answer. Falling back to today's text would produce a document
 * that looks authoritative and is not the one that was agreed to, which is
 * worse than refusing to produce one.
 */
export function getTermsVersion(version: string | null): TermsDocument | null {
  if (!version) return null;
  return BY_VERSION.get(version) ?? null;
}
