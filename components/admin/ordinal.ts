/**
 * "1st", "2nd", "3rd", "4th".
 *
 * Duplicated from lib/vendor-history rather than imported, because that module
 * is server-only: it holds the Supabase client. This is four lines of pure
 * arithmetic with no way to drift meaningfully, and the alternative is pulling
 * a database client into a card component.
 */
export function ordinalLabel(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  if (ones === 1) return `${n}st`;
  if (ones === 2) return `${n}nd`;
  if (ones === 3) return `${n}rd`;
  return `${n}th`;
}
