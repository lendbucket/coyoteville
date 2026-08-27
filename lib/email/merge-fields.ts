/**
 * Merge fields, so one message can go to twenty vendors and read personally.
 *
 * Written as {{business_name}}. Substitution happens on the fully assembled
 * strings, after the body has already been sanitised, which matters: a merge
 * value is data, not markup, so it is escaped on the way in and cannot
 * introduce a tag even if a business name contains one.
 *
 * A field with nothing behind it falls back to something that still reads as a
 * sentence rather than leaving a hole. "Spot number" is the common case: most
 * vendors do not have one assigned until the morning of.
 */

export type MergeContext = {
  business_name: string;
  contact_name: string;
  spot_type: string;
  spot_number: string;
  event_date: string;
};

export type MergeField = {
  token: string;
  label: string;
  /** Shown in the insert menu so it is obvious what will appear. */
  example: string;
};

export const MERGE_FIELDS: readonly MergeField[] = [
  { token: 'business_name', label: 'Business name', example: "Abuelita's Barbacoa" },
  { token: 'contact_name', label: 'Contact name', example: 'Maria Guzman' },
  { token: 'spot_type', label: 'Spot type', example: 'Food Truck Spot' },
  { token: 'spot_number', label: 'Spot number', example: 'A4' },
  { token: 'event_date', label: 'Event date', example: 'Friday, August 28, 2026' },
] as const;

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fill the tokens in a string.
 *
 * `escape` is on for anything going into HTML and off for the plain text part
 * and the subject line, where entities would show up literally.
 */
export function applyMerge(input: string, context: MergeContext, escape = true): string {
  return input.replace(TOKEN_RE, (whole, key: string) => {
    if (!(key in context)) return whole;
    const value = context[key as keyof MergeContext] ?? '';
    return escape ? escapeHtml(value) : value;
  });
}

/** Which tokens a draft actually uses, for warning about unknown ones. */
export function tokensUsed(input: string): string[] {
  const found = new Set<string>();
  for (const match of input.matchAll(TOKEN_RE)) found.add(match[1]);
  return [...found];
}

/** Tokens that look like merge fields but are not ones we know. */
export function unknownTokens(input: string): string[] {
  const known = new Set(MERGE_FIELDS.map((f) => f.token));
  return tokensUsed(input).filter((t) => !known.has(t));
}

/**
 * A context built from a vendor row, with fallbacks.
 *
 * Not "TBD" or an empty string for a missing spot number: the sentence around
 * it was written assuming a value, so it gets one that keeps the sentence
 * upright.
 */
export function contextFrom(row: {
  business_name?: string | null;
  contact_name?: string | null;
  spot_type?: string | null;
  spot_number?: string | null;
  spotTypeLabel?: string | null;
  eventDate?: string | null;
}): MergeContext {
  return {
    business_name: row.business_name || 'your business',
    contact_name: row.contact_name || 'there',
    spot_type: row.spotTypeLabel || row.spot_type || 'your spot',
    spot_number: row.spot_number || 'not assigned yet',
    event_date: row.eventDate || 'the event',
  };
}

/** Stand-in context for the preview when nobody is selected yet. */
export const SAMPLE_CONTEXT: MergeContext = {
  business_name: "Abuelita's Barbacoa",
  contact_name: 'Maria Guzman',
  spot_type: 'Food Truck Spot',
  spot_number: 'A4',
  event_date: 'Friday, August 28, 2026',
};
