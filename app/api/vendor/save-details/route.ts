import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { upsertVendorFromApplication } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Save your details so you never upload this again."
 *
 * Offered once, after an anonymous application has already succeeded. It takes
 * the application id and nothing else: every value is read back off the row
 * that was just written, so this cannot be used to plant details for an address
 * somebody does not control.
 *
 * It creates or fills the profile and then hands off to the magic link route,
 * which is what actually proves the address. Until that link is clicked the
 * profile is unclaimed: it holds details but nobody can sign into it, which is
 * exactly the state the thirty four backfilled profiles are already in.
 *
 * Only for an application submitted in the last hour. The offer belongs to the
 * moment after submitting, and an old application id should not be a way to
 * trigger an email later.
 */
const CLAIM_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Not connected yet.' }, { status: 503 });
  }

  const limit = rateLimit(`save-details:${getClientIp(request.headers)}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Give it a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Bad application id.' }, { status: 400 });
  }

  const { data: row, error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .select(
      'id, business_name, contact_name, phone, email, sells, serves_food, logo_path, photo_paths, permit_path, created_at, vendor_id'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ ok: false, error: 'Application not found.' }, { status: 404 });
  }

  if (Date.now() - Date.parse(row.created_at) > CLAIM_WINDOW_MS) {
    return NextResponse.json(
      { ok: false, error: 'That application is a while old now. Sign in with your email instead.' },
      { status: 409 }
    );
  }

  const profile = await upsertVendorFromApplication({
    email: row.email,
    business_name: row.business_name,
    contact_name: row.contact_name,
    phone: row.phone,
    sells: row.sells,
    serves_food: Boolean(row.serves_food),
    logo_path: row.logo_path,
    photo_paths: row.photo_paths,
    permit_path: row.permit_path,
    /* Deliberately not carried over. The application captured a permit but this
       route has no expiry date to attach to it, and a stored permit without one
       is treated as expired everywhere. The vendor sets it on the profile page,
       which is the only place that can ask them for it. */
    permit_expires_at: null,
  });

  if (!profile) {
    return NextResponse.json(
      { ok: false, error: 'We could not save those details. Email us and we will sort it out.' },
      { status: 500 }
    );
  }

  // Link the application to the profile it just created, so the tracker's
  // returning count sees it straight away.
  if (!row.vendor_id) {
    await getSupabaseAdmin()
      .from('vendor_applications')
      .update({ vendor_id: profile.id })
      .eq('id', row.id);
  }

  return NextResponse.json({ ok: true, email: profile.email });
}
