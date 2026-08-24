/**
 * The audit trail for photo handoffs.
 *
 * Kept apart from media-email so the tracker page can read the history without
 * pulling the image pipeline, and sharp with it, into the page render.
 */

const SEND_MARKER = 'Photos sent to';

/**
 * A literal regex rather than one built from a template string.
 *
 * `\S` inside a template literal is not an escape JavaScript recognises, so it
 * collapses to a bare "S" and the pattern silently stops matching anything.
 * Written literally there is nothing to get wrong, and a fresh one per call
 * means no lastIndex can ever be carried between reads.
 */
const sendPattern = () => /Photos sent to (\S+) (\S+)/g;

export type MediaSend = { to: string; at: string };

export function mediaSendNote(to: string, now: Date = new Date()): string {
  return `${SEND_MARKER} ${to} ${now.toISOString()}`;
}

/** Every logged send on a row, oldest first. */
export function mediaSendsFrom(adminNotes: string | null): MediaSend[] {
  if (!adminNotes) return [];

  return [...adminNotes.matchAll(sendPattern())]
    .map((m) => ({ to: m[1], at: m[2] }))
    .filter((s) => !Number.isNaN(Date.parse(s.at)))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function lastMediaSendFrom(adminNotes: string | null): MediaSend | null {
  return mediaSendsFrom(adminNotes).at(-1) ?? null;
}
