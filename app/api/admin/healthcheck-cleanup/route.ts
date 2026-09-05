import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import {
  HEALTHCHECK_BUSINESS_NAME,
  HEALTHCHECK_STALE_MINUTES,
  isHealthcheckRequest,
} from '@/lib/healthcheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Delete the rows the production health check wrote.
 *
 * Called twice per run: once at the start with `stale: true`, which clears
 * debris a crashed run left behind, and once at the end to remove what this run
 * created. Running it first as well as last is what stops a run that died
 * halfway from accumulating rows forever.
 *
 * Authorised by HEALTHCHECK_SECRET rather than by an admin session, so the
 * GitHub Actions run does not need to hold Robert's password to tidy up after
 * itself. It is a narrower credential than the admin one and it can do exactly
 * one thing.
 *
 * The delete is filtered on business_name and nothing else is accepted. There
 * is no id parameter, no table parameter and no filter the caller can widen:
 * the worst a stolen secret can do here is delete rows that only the health
 * check ever creates. That is deliberate. This endpoint runs on a schedule
 * against the live vendor table and its blast radius should be provably zero.
 */
export async function POST(request: Request) {
  if (!isHealthcheckRequest(request.headers)) {
    // Deliberately the same answer an unauthenticated admin call gets, so this
    // endpoint's existence is not a signal to somebody probing.
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { stale?: boolean } | null;
  const staleOnly = body?.stale === true;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('vendor_applications')
    .delete()
    /* The only filter, and it is not negotiable. A caller cannot broaden this
       and there is no branch that omits it. */
    .eq('business_name', HEALTHCHECK_BUSINESS_NAME);

  if (staleOnly) {
    const cutoff = new Date(Date.now() - HEALTHCHECK_STALE_MINUTES * 60_000).toISOString();
    query = query.lt('created_at', cutoff);
  }

  const { data, error } = await query.select('id');

  if (error) {
    console.error('healthcheck cleanup failed', error);
    return NextResponse.json({ ok: false, error: 'Cleanup failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: (data ?? []).length, staleOnly });
}
