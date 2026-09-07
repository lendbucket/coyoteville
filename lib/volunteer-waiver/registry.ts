import 'server-only';
import type { WaiverDocument } from './types';
import v0_1 from './versions/vol-v0-1-draft-2026';
import v1_0 from './versions/vol-v1-0-2026';

/**
 * Every version of the volunteer waiver anybody has ever signed.
 *
 * vol-v0.1-DRAFT-2026 is in here and nobody ever signed it: it went live, went
 * to counsel, came back approved unchanged, and was promoted to vol-v1.0-2026.
 * It stays because this directory keeps every version by rule rather than every
 * version somebody happened to use, and a rule with an exception for the
 * inconvenient cases is not a rule.
 *
 * The program terms got a versions directory only after a rename had already
 * changed the text under rows that had signed the old wording, which meant that
 * for one commit those rows named a document nobody could produce. Starting a
 * signed instrument without this is a choice to have that same problem later.
 */
const RECORDS: WaiverDocument[] = [v0_1, v1_0];

const BY_VERSION = new Map(RECORDS.map((doc) => [doc.version, doc]));

export const WAIVER_VERSIONS = RECORDS;

/**
 * The text a signed row points at, or null for a string never issued here.
 *
 * Null is a real answer. Producing today's text under yesterday's version
 * string would be a document that looks authoritative and is not the one that
 * was signed.
 */
export function getWaiverVersion(version: string | null): WaiverDocument | null {
  if (!version) return null;
  return BY_VERSION.get(version) ?? null;
}
