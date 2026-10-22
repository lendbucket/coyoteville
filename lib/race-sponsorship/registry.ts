import 'server-only';
import type { SponsorshipDocument } from './types';
import v0_1 from './versions/sponsor-v0-1-draft-2026';

/**
 * Every version of the sponsorship agreement anybody has ever accepted.
 *
 * One entry today. A business that committed fifteen hundred dollars is
 * entitled to produce the exact document it agreed to, unchanged, a year
 * later, and that is only possible if the directory exists before the first
 * one is signed rather than after.
 */
const RECORDS: SponsorshipDocument[] = [v0_1];

const BY_VERSION = new Map(RECORDS.map((doc) => [doc.version, doc]));

export const SPONSORSHIP_VERSIONS = RECORDS;

/** The text a row points at, or null for a string never issued here. */
export function getSponsorshipVersion(version: string | null): SponsorshipDocument | null {
  if (!version) return null;
  return BY_VERSION.get(version) ?? null;
}
