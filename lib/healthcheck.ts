import 'server-only';

/**
 * The production health check's footprint in the live database.
 *
 * Every live failure this week happened past the point a build gate can see: a
 * NOT NULL that only the real table had, a CSP that only the real browser
 * enforced. The only way to catch that class of thing is to complete a real
 * signup against the real site, which means writing real rows.
 *
 * So the rows are real, and they are marked. Everything that counts vendors or
 * lists them excludes this business name, so a health check row can never hold
 * a spot, appear in the tracker, move a capacity meter, or be mistaken for
 * somebody who wants to sell slime.
 *
 * The marker is the business name rather than a column, deliberately. A column
 * would need a migration, and worse, a query that forgot to filter on it would
 * silently include the row. A name this ugly shows up immediately in anything
 * that does leak, which is the failure mode you want.
 */

/** Stamped on every row the health check creates. Nothing else may use it. */
export const HEALTHCHECK_BUSINESS_NAME = '__healthcheck__';

/** Domain the health check's contact address always sits on. */
export const HEALTHCHECK_EMAIL_DOMAIN = 'healthcheck.coyoteville.invalid';

/**
 * A health check row older than this is debris from a crashed run.
 *
 * Deleted at the start of every run rather than only at the end, so a run that
 * dies halfway cannot leave rows behind for the next one to trip over. Fifteen
 * minutes is comfortably longer than a run and comfortably shorter than the six
 * hour interval.
 */
export const HEALTHCHECK_STALE_MINUTES = 15;

/**
 * Applied as .neq('business_name', HEALTHCHECK_BUSINESS_NAME) inline on every
 * query that counts or lists vendors, and enforced by scripts/check-schema.js
 * so a new one cannot forget.
 *
 * Deliberately not a helper that takes the query builder and returns it. That
 * was the first shape and TypeScript rejected it with TS2589, instantiation
 * depth: the PostgREST builder type is recursive enough that threading it
 * through a generic explodes. lib/admin-data hit the same wall and solved it
 * the same way, by handing back a column and a value rather than a builder.
 */

/**
 * Is this request the health check, proved by a shared secret?
 *
 * Constant time compare, because this decides whether a request may write a row
 * that skips payment. A length check first, since timingSafeEqual throws on a
 * mismatch.
 *
 * Returns false when HEALTHCHECK_SECRET is unset, which is what makes this
 * impossible to reach from a deployment that has not opted in. There is no
 * development bypass and no default value: an environment without the secret
 * has no health check branch at all.
 */
export function isHealthcheckRequest(headers: Headers): boolean {
  const expected = process.env.HEALTHCHECK_SECRET;
  if (!expected || expected.length < 24) return false;

  const provided = headers.get('x-coyoteville-healthcheck');
  if (!provided) return false;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
