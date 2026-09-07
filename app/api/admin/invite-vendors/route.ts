import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { HEALTHCHECK_BUSINESS_NAME } from '@/lib/healthcheck';
import { renderVendorInvite } from '@/lib/email/vendor-invite';
import { sendReminderEmail } from '@/lib/notify';
import { supportEmail } from '@/lib/support';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The one time invite for past vendors to claim a profile.
 *
 * Sent once, by hand, and never again. There is no schedule behind this, no
 * follow up and no second wave: somebody who ignores it keeps applying
 * anonymously, which works exactly as it always has. That is the whole design,
 * and it is why invited_at exists rather than a counter.
 *
 * GET returns the count so the tracker can name it in the confirmation. POST
 * sends.
 */

/** Between sends. Resend rate limits, and thirty four at once looks like a blast. */
const SEND_GAP_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Candidate = { id: string; email: string; business_name: string | null };

/**
 * Who has not been invited and has not signed in.
 *
 * Three filters beyond the obvious two. Health check rows, as everywhere. Rows
 * with no email, which cannot be sent to. And rows with no real application
 * behind them, because "past vendors" means people who actually set up here:
 * a profile created by some future path with nothing behind it is not somebody
 * Robert has met, and this email opens by saying they have set up before.
 */
async function candidates(): Promise<Candidate[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('vendors')
    .select('id, email, business_name')
    .is('auth_user_id', null)
    .is('invited_at', null)
    .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
    .order('business_name', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as Candidate[];
  const withEmail = rows.filter((r) => r.email && r.email.includes('@'));
  if (!withEmail.length) return [];

  /* Which of them have actually applied. One query rather than one per vendor,
     and it doubles as the "never had a real application" filter. */
  const { data: applied, error: appliedError } = await supabase
    .from('vendor_applications')
    .select('vendor_id')
    .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
    .in(
      'vendor_id',
      withEmail.map((r) => r.id)
    );

  if (appliedError) throw appliedError;

  const hasApplication = new Set(
    ((applied ?? []) as { vendor_id: string | null }[]).map((a) => a.vendor_id).filter(Boolean)
  );

  return withEmail.filter((r) => hasApplication.has(r.id));
}

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  try {
    const list = await candidates();
    return NextResponse.json({
      ok: true,
      count: list.length,
      names: list.map((c) => c.business_name || c.email).slice(0, 60),
    });
  } catch (err) {
    console.error('could not count invite candidates', err);
    return NextResponse.json({ ok: false, error: 'Could not read the vendor list.' }, { status: 500 });
  }
}

export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();

  let list: Candidate[];
  try {
    list = await candidates();
  } catch (err) {
    console.error('could not read invite candidates', err);
    return NextResponse.json({ ok: false, error: 'Could not read the vendor list.' }, { status: 500 });
  }

  const failures: { name: string; error: string }[] = [];
  let sent = 0;

  for (const vendor of list) {
    const name = vendor.business_name || vendor.email;

    try {
      /* The login page with their address already in the box, so claiming is a
         tap and then a tap. The link does not sign anybody in on its own: they
         still get a magic link, which is what proves the address. A link in an
         email that logs you in on click is a link anybody who forwards the
         email can use. */
      const loginUrl = `${SITE_URL}/vendor/login?email=${encodeURIComponent(vendor.email)}`;

      const message = renderVendorInvite({
        businessName: vendor.business_name || 'there',
        loginUrl,
        supportEmail: supportEmail(),
      });

      const ok = await sendReminderEmail(vendor.email, message);

      if (!ok) {
        failures.push({ name, error: 'the email provider refused it' });
        continue;
      }

      /* Stamped immediately after each send rather than in a batch at the end.
         A crash halfway through leaves the ones already sent marked, so running
         it again picks up where it stopped instead of mailing the first fifteen
         people twice. */
      const { error } = await supabase
        .from('vendors')
        .update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', vendor.id);

      if (error) {
        /* Sent but not recorded, which is the one outcome worth shouting about:
           running again would mail them a second time. Reported as a failure so
           it is visible rather than counted as a clean send. */
        console.error('invite sent but invited_at not stamped', vendor.id, error);
        failures.push({ name, error: 'sent, but we could not record it. Do not run this again until it is checked.' });
        continue;
      }

      sent += 1;
    } catch (err) {
      console.error('invite failed for', vendor.id, err);
      failures.push({ name, error: (err as Error)?.message?.slice(0, 120) || 'unknown error' });
    }

    await sleep(SEND_GAP_MS);
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed: failures.length,
    failures,
  });
}
