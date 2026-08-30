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

/** True when the scope is a real event rather than one of the pseudo scopes. */
export function isEventScope(scope: string): boolean {
  return scope !== DAY_SCOPE && scope !== MONTHLY_SCOPE;
}

/** What the scope picker calls each pseudo scope. */
export const SCOPE_LABELS: Record<string, string> = {
  [DAY_SCOPE]: 'Daily bookings',
  [MONTHLY_SCOPE]: 'Monthly vendors',
};
