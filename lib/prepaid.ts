import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { NEXT_EVENT } from './seo';

/**
 * Hidden prepaid registration link.
 *
 * For vendors who already committed and paid off the site and now need to
 * register, sign the agreement and send their documents. There is no payment
 * step and Square is never involved.
 *
 * The URL is the only credential, and links get forwarded, so two further gates
 * stand behind it. Both are read from the environment and both are checked on
 * the server, on the page and again in the API route, so a stale tab or a
 * direct post cannot get past either one:
 *
 *   PREPAID_LINK_EXPIRES_AT   ISO timestamp. Nothing is accepted after it.
 *   PREPAID_MAX_REGISTRATIONS How many offline rows the event may take.
 */

export function prepaidToken(): string | null {
  return process.env.PREPAID_ACCESS_TOKEN || null;
}

export function isPrepaidConfigured(): boolean {
  return Boolean(prepaidToken());
}

/** Constant time compare, so the response cannot be used to guess the token. */
export function tokenMatches(candidate: string): boolean {
  const expected = prepaidToken();
  if (!expected || !candidate) return false;

  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) {
    // Still burn a comparison so length is not readable from timing.
    timingSafeEqual(a, a);
    return false;
  }

  return timingSafeEqual(a, b);
}

/** Epoch ms of the link expiry, or null when none is set. */
export function expiresAtMs(): number | null {
  const raw = process.env.PREPAID_LINK_EXPIRES_AT;
  if (!raw) return null;

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    console.error(`PREPAID_LINK_EXPIRES_AT is not a valid timestamp: "${raw}"`);
    // An unreadable expiry is treated as expired. Failing closed is the safe
    // direction for a link that hands out approved, paid spots.
    return 0;
  }

  return parsed;
}

/** Registration cap, or null when none is set. */
export function maxRegistrations(): number | null {
  const raw = process.env.PREPAID_MAX_REGISTRATIONS;
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`PREPAID_MAX_REGISTRATIONS is not a whole number: "${raw}"`);
    return 0;
  }

  return n;
}

export type PrepaidGate = {
  open: boolean;
  reason: null | 'unconfigured' | 'expired' | 'full' | 'unavailable';
  used: number;
  max: number | null;
  expiresAtMs: number | null;
};

/** Count offline registrations already taken for an event. */
async function countOffline(eventSlug: string): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from('vendor_applications')
      .select('id', { count: 'exact', head: true })
      .eq('event_slug', eventSlug)
      .eq('payment_method', 'offline');

    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.error('prepaid registration count failed', err);
    return null;
  }
}

/**
 * Whether the prepaid link is currently accepting registrations.
 *
 * Called by the page to decide what to render, and independently by the API
 * route before it will write anything.
 */
export async function checkPrepaidGate(
  eventSlug: string = NEXT_EVENT.slug,
  now: number = Date.now()
): Promise<PrepaidGate> {
  const expires = expiresAtMs();
  const max = maxRegistrations();

  const base: PrepaidGate = { open: false, reason: null, used: 0, max, expiresAtMs: expires };

  if (!isPrepaidConfigured()) return { ...base, reason: 'unconfigured' };
  if (expires !== null && now >= expires) return { ...base, reason: 'expired' };

  if (max === null) return { ...base, open: true };

  const used = await countOffline(eventSlug);
  if (used === null) {
    // The cap cannot be verified, so nothing is accepted. Letting registrations
    // through unchecked could quietly overshoot the number of spots that exist.
    return { ...base, reason: 'unavailable' };
  }

  return { ...base, open: used < max, reason: used < max ? null : 'full', used };
}
