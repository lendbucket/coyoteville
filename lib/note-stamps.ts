/**
 * Dated stamps appended to an admin_notes column.
 *
 * Pure string work, in its own file with no database import, because both the
 * vendor side and the race side need it and one of them needs it from a build
 * gate that has no Supabase to hand. Reading a stamp should not require a
 * connection.
 *
 * The format is one marker and one ISO timestamp, several to a column joined
 * with a separator, so a row keeps its whole history and the most recent of
 * any kind can be read back out.
 */

/** The latest timestamp written under this marker, or null. */
export function lastStampFrom(adminNotes: string | null, marker: string): string | null {
  if (!adminNotes) return null;

  const stamps = [...adminNotes.matchAll(new RegExp(`${marker} (\S+)`, 'g'))]
    .map((m) => m[1])
    .filter((s) => !Number.isNaN(Date.parse(s)));

  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

export function stampNote(marker: string, now: Date = new Date()): string {
  return `${marker} ${now.toISOString()}`;
}
