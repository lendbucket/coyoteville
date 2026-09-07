import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { claimVendor, issueVendorToken, VENDOR_COOKIE, VENDOR_COOKIE_OPTIONS } from '@/lib/vendors';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where a magic link lands.
 *
 * Verifies the token with Supabase Auth, which is what actually proves the
 * address, then claims the profile for it and sets our own session cookie. The
 * Supabase session itself is discarded: nothing in this app talks to Supabase
 * from the browser, so a session that only the browser could use has no job.
 *
 * A redirect either way, never a JSON error, because this URL is opened by a
 * person tapping a link in their mail app and the only useful outcome is a page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const email = url.searchParams.get('email') ?? '';

  const fail = (reason: string) =>
    NextResponse.redirect(`${SITE_URL}/vendor/login?error=${encodeURIComponent(reason)}`);

  if (!isSupabaseConfigured()) return fail('not-configured');
  if (!tokenHash || !email) return fail('bad-link');

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });

    if (error || !data?.user?.id) {
      // Expired or already used. Both are ordinary and both want the same page.
      return fail('expired');
    }

    const profile = await claimVendor(data.user.email ?? email, data.user.id);
    if (!profile) return fail('no-profile');

    const token = issueVendorToken(profile.id);
    const response = NextResponse.redirect(`${SITE_URL}/vendor/profile`);
    response.cookies.set(VENDOR_COOKIE, token.value, {
      ...VENDOR_COOKIE_OPTIONS,
      maxAge: token.maxAge,
    });
    return response;
  } catch (err) {
    console.error('magic link callback failed', err);
    return fail('failed');
  }
}
