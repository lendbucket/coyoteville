/**
 * The agreement as data rather than markup.
 *
 * The signing page and the signed PDF have to say the same words, and a signed
 * row points at a version string rather than at whatever the component happens
 * to render today. So the text lives here, one file per version, and both the
 * page and the PDF read it. Nothing renders agreement prose from anywhere else.
 *
 * The model is deliberately small. It carries exactly the distinctions that are
 * load bearing in the document: what is a heading, what is a numbered item,
 * which runs are bold, and which blocks are the conspicuous ones. It carries no
 * styling, because the page and the PDF style them differently and neither gets
 * to change what the words are.
 */

/** A span of text within a paragraph. `break` is a hard line break. */
export type AgreementRun = {
  text: string;
  bold?: boolean;
  break?: boolean;
};

export type AgreementBlock =
  | { kind: 'heading'; text: string }
  | {
      kind: 'paragraph';
      runs: AgreementRun[];
      /** The opening recital, set apart from the numbered sections. */
      lead?: boolean;
      /** Closing acknowledgment copy, set heavier than body prose. */
      emphasis?: boolean;
    }
  | { kind: 'list'; ordered: boolean; items: AgreementRun[][] }
  /**
   * A conspicuous provision: release, indemnity, assumption of risk,
   * acknowledgment. Texas will not enforce an indemnity that shifts a party's
   * own negligence unless it is conspicuous, so every renderer of this block
   * has to keep it bold, uppercase, larger than the surrounding copy, and
   * inside a heavy border. It is not decoration and it is not optional.
   */
  | { kind: 'conspicuous'; heading?: string; blocks: AgreementBlock[] }
  /**
   * Where this version put its counterparty signature block. It is a position
   * rather than content: the signing page draws the two party columns here, and
   * the PDF skips it, because a signed PDF carries a fuller execution block of
   * its own at the end. Kept in the block list so the order the vendor read the
   * document in survives, which for v3.0 on means the counterparty is
   * established before the clause that makes a typed name binding.
   */
  | { kind: 'counterparty' };

export type AgreementDocument = {
  version: string;
  /** Only the v1 waiver carried its own title line. */
  title?: string;
  blocks: AgreementBlock[];
};

/** Plain text of a run list, for measuring or for a non-rendering consumer. */
export function runsToText(runs: AgreementRun[]): string {
  return runs.map((run) => (run.break ? '\n' : run.text)).join('');
}

/** How many numbered sections a version has. */
export function sectionCount(document: AgreementDocument): number {
  return document.blocks.filter((block) => block.kind === 'heading').length;
}
