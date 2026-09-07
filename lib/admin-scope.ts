/**
 * What the tracker is scoped to.
 *
 * An event slug, or one of these two, for the bookings that are not tied to an
 * event at all. They live here rather than in lib/admin-data because that file
 * is server-only and the scope picker is a client component: two string
 * constants are not worth a 'server-only' boundary violation, and duplicating
 * them would be exactly the drift this file exists to prevent.
 *
 * Prefixed so they can never collide with a real event slug, whatever anybody
 * names an event later.
 */
export const DAY_SCOPE = 'scope:day';
export const MONTHLY_SCOPE = 'scope:monthly';

/**
 * Everything, everywhere.
 *
 * The tracker was scoped to one thing at a time and every scope had to be
 * chosen deliberately, which meant a booking outside the event you happened to
 * be looking at did not exist. A vendor started a single day booking and was
 * nowhere on the page: not missing, not filtered out, simply never asked for.
 * The only way to find her was to already suspect she was there.
 *
 * This scope asks for all of it. Denied and cancelled rows are left out, so it
 * is everything live rather than everything ever, and each row carries what it
 * is booked for because in this view that is no longer obvious.
 */
export const ALL_SCOPE = 'scope:all';

/** The pseudo scopes, in the order the picker lists them. */
export const PSEUDO_SCOPES = [ALL_SCOPE, DAY_SCOPE, MONTHLY_SCOPE] as const;

/** True when the scope is a real event rather than one of the pseudo scopes. */
export function isEventScope(scope: string): boolean {
  return !(PSEUDO_SCOPES as readonly string[]).includes(scope);
}

/** What the scope picker calls each pseudo scope. */
export const SCOPE_LABELS: Record<string, string> = {
  [ALL_SCOPE]: 'Everything',
  [DAY_SCOPE]: 'Daily bookings',
  [MONTHLY_SCOPE]: 'Monthly vendors',
};
