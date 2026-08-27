/**
 * The admin_notes trail for composed emails.
 *
 * Same idea as lib/media-log: one marker per line item, appended to the row's
 * admin_notes so it keeps its whole history rather than being overwritten. A
 * vendor's row should be able to answer "what have we actually sent this
 * person" without going to the mail provider.
 *
 * Subjects can contain anything, including the separator, so the stored form
 * escapes it rather than hoping.
 */

const MARKER = '[email]';
const SEP = ' · ';

/** What gets appended to admin_notes when a message goes out. */
export function composeSendNote(
  to: string,
  subject: string,
  now: Date = new Date()
): string {
  const safeSubject = subject.replace(/[\r\n]+/g, ' ').replace(/·/g, '-').trim().slice(0, 120);
  return `${MARKER} ${now.toISOString()} to ${to}: ${safeSubject}`;
}

export type ComposeSend = { at: string; to: string; subject: string };

export function composeSendsFrom(adminNotes: string | null): ComposeSend[] {
  if (!adminNotes) return [];

  const out: ComposeSend[] = [];
  for (const part of adminNotes.split(SEP)) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(MARKER)) continue;

    const rest = trimmed.slice(MARKER.length).trim();
    const match = rest.match(/^(\S+) to (\S+): ([\s\S]*)$/);
    if (!match) continue;
    if (Number.isNaN(Date.parse(match[1]))) continue;

    out.push({ at: match[1], to: match[2], subject: match[3] });
  }

  return out;
}

export function lastComposeSendFrom(adminNotes: string | null): ComposeSend | null {
  const all = composeSendsFrom(adminNotes);
  if (!all.length) return null;
  return all.sort((a, b) => a.at.localeCompare(b.at)).at(-1) ?? null;
}
