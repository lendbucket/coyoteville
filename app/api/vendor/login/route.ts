import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { renderMagicLink } from '@/lib/email/magic-link';
import { sendReminderEmail } from '@/lib/notify';
import { normaliseEmail, findVendorByEmail } from '@/lib/vendors';
import { supportEmail } from '@/lib/support';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** How long Supabase's link lives, roughly, for the copy in the email. */
const LINK_MINUTES = 60;

/**
 * Send a vendor a magic link.
 *
 * The link is generated with the service role client and emailed by us through
 * Resend, rather than letting Supabase send its own. Three reasons, in order of
 * how much they matter:
 *
 *   The browser never needs a Supabase key of any kind. There is no anon key in
 *   this app and there does not need to be, because every read and write goes
 *   through a route handler.
 *
 *   The email is ours. It is the same branded template family as everything
 *   else a vendor gets, and it passes check-email-copy like the rest.
 *
 *   The rate limit is ours. Supabase's is per project and generous; this is per
 *   address, because the thing being protected is somebody's inbox and the
 *   person being protected from is not necessarily the person asking.
 *
 * The response is deliberately identical whether or not a profile exists. An
 * endpoint that answers "no account" for one address and "sent" for another is
 * a way to find out who sells at Coyoteville.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Sign in is not connected yet. Email us and we will sort it out.' },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; firstTime?: boolean }
    | null;
  const email = normaliseEmail(String(body?.email ?? ''));

  if (!EMAIL_RE.test(email) || email.length > 180) {
    return NextResponse.json({ ok: false, error: 'That email does not look right.' }, { status: 400 });
  }

  /* Two limits, because they stop different things. Per address stops one
     inbox being buried, which is the abuse that matters here: the person
     asking is not necessarily the person receiving. Per IP stops one machine
     walking a list of addresses. */
  const perEmail = rateLimit(`magiclink-email:${email}`, 3, 15 * 60 * 1000);
  const perIp = rateLimit(`magiclink-ip:${getClientIp(request.headers)}`, 10, 15 * 60 * 1000);

  if (!perEmail.ok || !perIp.ok) {
    const retry = Math.max(perEmail.retryAfterSeconds ?? 0, perIp.retryAfterSeconds ?? 0);
    return NextResponse.json(
      {
        ok: false,
        error: 'We have sent a few links to that address already. Check your inbox, and try again in a little while.',
      },
      { status: 429, headers: { 'Retry-After': String(retry) } }
    );
  }

  const existing = await findVendorByEmail(email);
  const firstTime = body?.firstTime === true || !existing?.claimed_at;

  try {
    const supabase = getSupabaseAdmin();

    /* generateLink creates the auth user if there is not one, which is what
       makes a first sign in and a returning sign in the same call. The
       redirect lands on our callback, which is where the profile is claimed. */
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${SITE_URL}/vendor/callback` },
    });

    if (error || !data?.properties?.hashed_token) {
      console.error('could not generate a magic link', error);
      // Same shape as success, so a failure here does not become a probe.
      return NextResponse.json({ ok: true, sent: true });
    }

    const url = new URL(`${SITE_URL}/vendor/callback`);
    url.searchParams.set('token_hash', data.properties.hashed_token);
    url.searchParams.set('email', email);

    const message = renderMagicLink({
      url: url.toString(),
      firstTime,
      minutes: LINK_MINUTES,
      supportEmail: supportEmail(),
    });

    const sent = await sendReminderEmail(email, message);
    if (!sent) console.error('magic link generated but the email did not send', email);
  } catch (err) {
    console.error('magic link failed', err);
  }

  // Always the same answer. See the note above about not leaking who has a row.
  return NextResponse.json({ ok: true, sent: true });
}
