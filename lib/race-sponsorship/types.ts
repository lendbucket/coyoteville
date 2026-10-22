/**
 * The shape of a versioned sponsorship agreement.
 *
 * The same shape the two waivers use, so all three render through one kind of
 * block list and read the same on a phone. No imports beyond this file: a
 * version is a frozen record of what a business actually accepted, so it may
 * not reach for a constant that can change underneath it.
 */

export type SponsorshipBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'conspicuous';
  text?: string;
  items?: string[];
};

export type SponsorshipDocument = {
  /** Stamped on every acceptance. Never reused, never edited. */
  version: string;
  entity: string;
  /** True while the text has not been through a lawyer. The page says so. */
  isDraft: boolean;
  blocks: SponsorshipBlock[];
};

export function sectionCount(doc: SponsorshipDocument): number {
  return doc.blocks.filter((b) => b.kind === 'heading' && /^\d+\./.test(b.text ?? '')).length;
}
