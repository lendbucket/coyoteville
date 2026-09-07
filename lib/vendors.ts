import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { HEALTHCHECK_BUSINESS_NAME } from './healthcheck';

/**
 * Vendor profiles.
 *
 * A returning vendor's saved details, so the ninth time they sell at a home
 * game they are not photographing their DSHS permit in a parking lot again.
 *
 * Three things this deliberately does not do:
 *
 *   It stores nothing about the signature. Every application is signed fresh,
 *   with its own name, timestamp, IP, user agent and agreement version. A
 *   signature copied forward from a previous application would be a record of
 *   nobody agreeing to anything.
 *
 *   It does not let a lapsed permit through. permit_expires_at is checked
 *   against the date being booked every time, and NULL counts as expired.
 *
 *   It does not become required. Anonymous signup is a first class path and
 *   vendor_id stays nullable.
 */

export const VENDOR_COOKIE = 'cv_vendor';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type VendorProfile = {
  id: string;
  auth_user_id: string | null;
  email: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  sells: string | null;
  serves_food: boolean | null;
  logo_path: string | null;
  photo_paths: string[] | null;
  permit_path: string | null;
  permit_expires_at: string | null;
  claimed_at: string | null;
  invited_at: string | null;
};

export const VENDOR_COLUMNS =
  'id, auth_user_id, email, business_name, contact_name, phone, sells, serves_food, ' +
  'logo_path, photo_paths, permit_path, permit_expires_at, claimed_at, invited_at';

/* ------------------------------------------------------------- the session */

/**
 * The vendor session cookie.
 *
 * Signed with the service role key the same way the admin cookie is signed with
 * the admin password: the cookie carries the profile id and an expiry, and an
 * HMAC over both. Nothing in it is secret and nothing in it can be forged
 * without a key that only the server has.
 *
 * Identity itself comes from Supabase Auth. The magic link is verified server
 * side, which is what proves the address; this cookie is only how that proof is
 * carried from one request to the next.
 */
function sessionSecret(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function issueVendorToken(vendorId: string): { value: string; maxAge: number } {
  const expiresAt = Date.now() + SESSION_MS;
  const payload = `v1.${vendorId}.${expiresAt}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: Math.floor(SESSION_MS / 1000) };
}

/** The profile id this token proves, or null. */
export function vendorIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;

  const [, vendorId, expiresRaw, mac] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (!safeEqual(mac, sign(`v1.${vendorId}.${expiresAt}`))) return null;

  return vendorId;
}

export const VENDOR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/** The signed in vendor's profile, or null. Safe to call anywhere on the server. */
export async function currentVendor(): Promise<VendorProfile | null> {
  if (!isSupabaseConfigured()) return null;

  /* Every failure here means "not signed in", and that is deliberate rather
     than lazy. This is called on the anonymous application path, which must
     work whether or not there is a session, whether or not the cookie parses,
     and whether or not there is a request scope to read one from at all. An
     application must never fail because the optional half of the feature threw.

     It also keeps the route callable outside a request, which is how
     scripts/check-booking-shape drives it. */
  let vendorId: string | null = null;
  try {
    const jar = await cookies();
    vendorId = vendorIdFromToken(jar.get(VENDOR_COOKIE)?.value);
  } catch {
    return null;
  }
  if (!vendorId) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('id', vendorId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as VendorProfile;
}

/* -------------------------------------------------------------- the profile */

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The profile for an address, or null. */
export async function findVendorByEmail(email: string): Promise<VendorProfile | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('email', normaliseEmail(email))
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as VendorProfile;
}

/**
 * Claim the profile for an address, creating it if there is none.
 *
 * The backfill means most returning vendors already have a row waiting with
 * their details in it, so signing in for the first time attaches an auth user
 * to work somebody already did rather than starting them empty.
 *
 * claimed_at is only stamped the first time. A vendor signing in again months
 * later has not re-claimed anything.
 */
export async function claimVendor(
  email: string,
  authUserId: string
): Promise<VendorProfile | null> {
  const supabase = getSupabaseAdmin();
  const address = normaliseEmail(email);
  const existing = await findVendorByEmail(address);

  if (existing) {
    if (existing.auth_user_id && existing.claimed_at) return existing;

    const { data, error } = await supabase
      .from('vendors')
      .update({
        auth_user_id: authUserId,
        claimed_at: existing.claimed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(VENDOR_COLUMNS)
      .single();

    if (error) return existing;
    return data as unknown as VendorProfile;
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      email: address,
      auth_user_id: authUserId,
      claimed_at: new Date().toISOString(),
    })
    .select(VENDOR_COLUMNS)
    .single();

  if (error) {
    console.error('could not create a vendor profile for', address, error);
    return null;
  }
  return data as unknown as VendorProfile;
}

/**
 * Create or update a profile from what an application just submitted.
 *
 * The one tap offer after an anonymous application. Only fills a field that the
 * profile does not already have a better answer for, except the files, which
 * are the whole point and are always the most recent ones.
 */
export async function upsertVendorFromApplication(args: {
  email: string;
  business_name: string;
  contact_name: string;
  phone: string;
  sells: string;
  serves_food: boolean;
  logo_path?: string | null;
  photo_paths?: string[] | null;
  permit_path?: string | null;
  permit_expires_at?: string | null;
}): Promise<VendorProfile | null> {
  const supabase = getSupabaseAdmin();
  const address = normaliseEmail(args.email);

  if (address.endsWith('.invalid') || args.business_name === HEALTHCHECK_BUSINESS_NAME) {
    // The health check's own submissions never become profiles.
    return null;
  }

  const existing = await findVendorByEmail(address);

  const fields = {
    business_name: args.business_name,
    contact_name: args.contact_name,
    phone: args.phone,
    sells: args.sells,
    serves_food: args.serves_food,
    logo_path: args.logo_path ?? existing?.logo_path ?? null,
    photo_paths: args.photo_paths?.length ? args.photo_paths : (existing?.photo_paths ?? null),
    permit_path: args.permit_path ?? existing?.permit_path ?? null,
    permit_expires_at: args.permit_expires_at ?? existing?.permit_expires_at ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from('vendors')
      .update(fields)
      .eq('id', existing.id)
      .select(VENDOR_COLUMNS)
      .single();
    if (error) return existing;
    return data as unknown as VendorProfile;
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert({ email: address, ...fields })
    .select(VENDOR_COLUMNS)
    .single();

  if (error) {
    console.error('could not save a vendor profile for', address, error);
    return null;
  }
  return data as unknown as VendorProfile;
}

/* --------------------------------------------------------------- the permit */

export type PermitStanding =
  | { usable: true; expiresAt: string }
  | { usable: false; reason: 'none' | 'no-expiry' | 'expired'; expiresAt: string | null };

/**
 * May this profile's stored permit be reused for a booking on `bookingDate`?
 *
 * NULL is treated exactly like expired, and deliberately so. An unknown expiry
 * is not a permit we can vouch for, and the whole reason this rule exists is
 * that a vendor turning up with a lapsed health permit is not a paperwork
 * problem, it is the health department's problem and then it is ours.
 *
 * `bookingDate` is a YYYY-MM-DD day key. A permit that expires on the day of
 * the event is still valid on that day.
 */
export function permitStanding(
  profile: Pick<VendorProfile, 'permit_path' | 'permit_expires_at'> | null,
  bookingDate: string | null
): PermitStanding {
  if (!profile?.permit_path) return { usable: false, reason: 'none', expiresAt: null };
  if (!profile.permit_expires_at) {
    return { usable: false, reason: 'no-expiry', expiresAt: null };
  }

  const against = bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)
    ? bookingDate
    : new Date().toISOString().slice(0, 10);

  // Both are YYYY-MM-DD, so a string compare is a date compare.
  if (profile.permit_expires_at < against) {
    return { usable: false, reason: 'expired', expiresAt: profile.permit_expires_at };
  }

  return { usable: true, expiresAt: profile.permit_expires_at };
}

/** What to tell the vendor about a permit they cannot reuse. */
export function permitRefusal(standing: PermitStanding, bookingLabel: string): string | null {
  if (standing.usable) return null;
  if (standing.reason === 'none') return 'Upload your Texas DSHS health permit.';
  if (standing.reason === 'no-expiry') {
    return 'We do not have an expiry date for the permit on file, so please upload a current one.';
  }
  return `The permit on file expired on ${standing.expiresAt}, which is before ${bookingLabel}. Upload a current one.`;
}
