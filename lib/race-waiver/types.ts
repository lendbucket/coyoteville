/**
 * The shape of a versioned race waiver.
 *
 * Identical to the volunteer waiver's shape, deliberately, so both render
 * through one component and read the same on a phone. No imports beyond this
 * file: a version is a frozen record of what somebody actually signed, so it
 * may not reach for a constant that can change underneath it.
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
  /** True while the text has not been through a lawyer. The page says so. */
  isDraft: boolean;
  blocks: WaiverBlock[];
};

/** Numbered sections, counted from the text rather than typed as a literal. */
export function sectionCount(doc: WaiverDocument): number {
  return doc.blocks.filter((b) => b.kind === 'heading' && /^\d+\./.test(b.text ?? '')).length;
}
