import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A link that lets one person fetch one document.
 *
 * The organization's confirmation email carries a link to its own signed terms.
 * That link cannot go through the admin session, because the organization is
 * not an admin, and the document cannot simply be public, because it carries a
 * contact name, an email, a phone number and the IP address they signed from.
 *
 * So the link carries a signature over exactly one document id. The token
 * proves the sender knew the secret at the time the email was written and
 * proves nothing else: it is not a session, it grants no other document, and
 * changing the id in the URL invalidates it. Somebody who forwards the email
 * shares their own terms, which is theirs to do.
 *
 * Keyed off ADMIN_PASSWORD rather than a new environment variable, so this
 * deploys without a configuration step. The purpose string is mixed in, so a token minted
 * for one kind of document cannot be replayed against another and no token here
 * can ever be mistaken for an admin session cookie.
 *
 * No expiry, deliberately. A signed agreement is a document somebody should be
 * able to open in two years, and an emailed link that quietly dies is worse
 * than one that keeps working: the alternative is the organization emailing to
 * ask for a copy, which is the thing this exists to avoid. Rotating
 * ADMIN_PASSWORD invalidates every token, which is the intended escape hatch.
 */

function secret(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

function sign(purpose: string, id: string, key: string): string {
  return createHmac('sha256', key).update(`${purpose}.${id}`).digest('hex').slice(0, 32);
}

/** Constant time compare that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing does not advertise the mismatch.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Mint a token, or null when there is no secret to sign with.
 *
 * Null is a real answer and callers must handle it: an environment with no
 * ADMIN_PASSWORD gets an email with no download link rather than an email
 * carrying a link that will never work.
 */
export function documentToken(purpose: string, id: string): string | null {
  const key = secret();
  if (!key) return null;
  return sign(purpose, id, key);
}

export function verifyDocumentToken(
  purpose: string,
  id: string,
  token: string | null | undefined
): boolean {
  const key = secret();
  if (!key || !token) return false;
  return safeEqual(token, sign(purpose, id, key));
}

/** The one purpose string in use. Named so a typo cannot silently mint a dud. */
export const ORG_TERMS_PURPOSE = 'org-terms';
