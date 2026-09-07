/**
 * The shape of a versioned volunteer waiver.
 *
 * The same shape the program terms use, deliberately, so the two render through
 * one component and read the same on a phone. No imports beyond this file: a
 * version is a frozen record of what somebody actually signed, so it may not
 * reach for a constant that can change underneath it.
 */

export type WaiverBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'conspicuous';
  text?: string;
  items?: string[];
};

export type WaiverDocument = {
  /** Stamped on every signature. Never reused, never edited. */
  version: string;
  /** The entity this version released. */
  entity: string;
  /**
   * True while the text has not been through a lawyer.
   *
   * Travels with the document rather than sitting in a constant somewhere,
   * because it is a fact about this text and not about the site. The page says
   * so on screen: somebody signing something Robert knows has not been reviewed
   * should be able to see that, and hiding it would be the wrong kind of tidy.
   */
  isDraft: boolean;
  blocks: WaiverBlock[];
};

/** Numbered sections, counted from the text rather than typed as a literal. */
export function sectionCount(doc: WaiverDocument): number {
  return doc.blocks.filter((b) => b.kind === 'heading' && /^\d+\./.test(b.text ?? '')).length;
}
