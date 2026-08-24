import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { invalidateSpots } from '@/lib/spots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVALS = ['pending', 'approved', 'waitlist', 'declined', 'cancelled'];

/** Inline edits from the tracker: approval status and spot number. */
export async function POST(request: Request) {
  if (!isAdminRequest()) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    approval_status?: string;
    spot_number?: string;
  } | null;

  const id = String(body?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Bad application id.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body?.approval_status !== undefined) {
    if (!APPROVALS.includes(body.approval_status)) {
      return NextResponse.json({ ok: false, error: 'Unknown status.' }, { status: 400 });
    }
    patch.approval_status = body.approval_status;
  }

  if (body?.spot_number !== undefined) {
    const spot = String(body.spot_number).trim().slice(0, 20);
    patch.spot_number = spot || null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, error: 'Nothing to change.' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('vendor_applications')
    .update(patch)
    .eq('id', id)
    .select('id, approval_status, spot_number, event_slug')
    .single();

  if (error || !data) {
    console.error('admin update failed', error);
    return NextResponse.json({ ok: false, error: 'Could not save that.' }, { status: 500 });
  }

  invalidateSpots(data.event_slug);

  return NextResponse.json({ ok: true, row: data });
}
