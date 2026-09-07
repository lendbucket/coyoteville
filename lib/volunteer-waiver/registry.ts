import 'server-only';
import type { WaiverDocument } from './types';
import v0_1 from './versions/vol-v0-1-draft-2026';

/**
 * Every version of the volunteer waiver anybody has ever signed.
 *
 * One so far, and the directory exists anyway. The program terms got a versions
 * directory only after a rename had already changed the text under rows that
 * had signed the old wording, which meant that for one commit those rows named
 * a document nobody could produce. Starting a signed instrument without this is
 * a choice to have that same problem later.
 */
const RECORDS: WaiverDocument[] = [v0_1];

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
