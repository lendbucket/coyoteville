/**
 * The shape of a versioned race waiver.
 *
 * Identical to the volunteer waiver's shape, deliberately, so both render
 * through one component and read the same on a phone. No imports beyond this
 * file: a version is a frozen record of what somebody actually signed, so it
 * may not reach for a constant that can change underneath it.
 */

export type WaiverBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'conspicuous' | 'document';
  text?: string;
  items?: string[];
  /**
   * Anchor, on a 'document' block only.
   *
   * race-v1.0-2026 is three documents in one instrument, each executed by its
   * own acknowledgment, and each acknowledgment checkbox links to its text. The
   * id is what it links to.
   */
  id?: string;
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

export type WaiverPart = {
  id: string;
  title: string;
  blocks: WaiverBlock[];
};

/**
 * The instrument split into the documents it contains.
 *
 * A 'document' block starts a new one. A version with no such block, which is
 * every version before v1.0, comes back as a single part so the renderer does
 * not need to care which shape it was handed.
 */
export function waiverParts(doc: WaiverDocument): WaiverPart[] {
  const parts: WaiverPart[] = [];

  for (const block of doc.blocks) {
    if (block.kind === 'document') {
      parts.push({
        id: block.id ?? String(parts.length),
        title: block.text ?? '',
        blocks: [],
      });
      continue;
    }

    if (!parts.length) {
      parts.push({ id: 'agreement', title: '', blocks: [] });
    }
    parts[parts.length - 1].blocks.push(block);
  }

  return parts;
}

/** Numbered sections, counted from the text rather than typed as a literal. */
export function sectionCount(doc: WaiverDocument): number {
  return doc.blocks.filter((b) => b.kind === 'heading' && /^\d+\./.test(b.text ?? '')).length;
}
