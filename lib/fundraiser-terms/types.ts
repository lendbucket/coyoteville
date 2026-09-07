/**
 * The shape of a versioned terms document.
 *
 * Deliberately tiny and deliberately free of imports. A version file must be a
 * frozen record of what somebody actually read, so it may not reach for a
 * constant that can change underneath it, and this type is the only thing it is
 * allowed to depend on.
 */

export type TermsBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'conspicuous';
  text?: string;
  items?: string[];
};

export type TermsDocument = {
  /** Stamped on every row that signed this text. Never reused, never edited. */
  version: string;
  /** The entity these terms were contracted with while this version was live. */
  entity: string;
  /** What the program was called in this version's own words. */
  programName: string;
  blocks: TermsBlock[];
};

/** Numbered sections, counted from the text rather than typed as a literal. */
export function sectionCount(doc: TermsDocument): number {
  return doc.blocks.filter((b) => b.kind === 'heading' && /^\d+\./.test(b.text ?? '')).length;
}
