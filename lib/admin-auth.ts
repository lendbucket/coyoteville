import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Admin session.
 *
 * One shared password out of ADMIN_PASSWORD. On a correct password we set a
 * cookie holding an expiry and an HMAC of that expiry keyed by the password
 * itself. Nothing can forge the cookie without knowing the password, and the
 * password is never stored in it.
 *
 * Comparisons are constant time so the response does not leak how much of a
 * guess was right.
 */

export const ADMIN_COOKIE = 'cv_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function secret(): string {
  const value = process.env.ADMIN_PASSWORD;
  if (!value) throw new Error('ADMIN_PASSWORD is not set.');
  return value;
}

function sign(expiresAt: number): string {
  return createHmac('sha256', secret()).update(`v1.${expiresAt}`).digest('hex');
}

/** Constant time string compare that tolerates length differences. */
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

export function checkPassword(candidate: string): boolean {
  if (!isAdminConfigured()) return false;
  return safeEqual(candidate, secret());
}

export function issueToken(): { value: string; maxAge: number } {
  const expiresAt = Date.now() + SESSION_MS;
  return {
    value: `${expiresAt}.${sign(expiresAt)}`,
    maxAge: Math.floor(SESSION_MS / 1000),
  };
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !isAdminConfigured()) return false;

  const dot = token.indexOf('.');
  if (dot < 1) return false;

  const expiresAt = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);

  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  return safeEqual(mac, sign(expiresAt));
}

/** True when the current request carries a valid admin session. */
export function isAdminRequest(): boolean {
  return verifyToken(cookies().get(ADMIN_COOKIE)?.value);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
