import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { invalidateSpots } from '@/lib/spots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVALS = ['pending', 'approved', 'waitlist', 'denied', 'cancelled'];

/** A hundred thousand dollars. A spot costs fifty; this catches a slipped key. */
const MAX_RECEIVED_CENTS = 10_000_000;

/**
 * Dollars typed into the tracker, as cents.
 *
 * Parsed off the string rather than through parseFloat times a hundred, which
 * turns "25.10" into 2510.0000000000005. Returns undefined for anything that is
 * not a plain amount, so a typo is rejected rather than rounded into the books.
 */
function centsFromDollars(input: string): number | undefined {
  const text = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return undefined;

  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(cents) && cents <= MAX_RECEIVED_CENTS ? cents : undefined;
}

/** Inline edits from the tracker: approval status, spot number, cash received. */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    approval_status?: string;
    spot_number?: string;
    /** Dollars as typed, e.g. "25" or "22.50". Empty string clears it. */
    amount_received_dollars?: string;
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

  /* Cash counted by hand.
   *
   * Offline rows only, and the check is against the stored payment_method
   * rather than anything the caller says, because this is the number the books
   * are reconciled against. An online row already has Square's word for what
   * was taken and nobody should be able to type over it.
   *
   * The amount is free to differ from amount_cents in either direction. A short
   * payment and an overpayment are both real things that happen at a gate, and
   * a field that only accepted the expected number would record a fiction. */
  const supabase = getSupabaseAdmin();
  let receivedChanged = false;

  if (body?.amount_received_dollars !== undefined) {
    const { data: row, error: readError } = await supabase
      .from('vendor_applications')
      .select('id, payment_method')
      .eq('id', id)
      .maybeSingle();

    if (readError || !row) {
      return NextResponse.json(
        { ok: false, error: 'That application does not exist.' },
        { status: 404 }
      );
    }

    if (row.payment_method !== 'offline') {
      return NextResponse.json(
        {
          ok: false,
          error: 'That spot was paid through Square, so there is no cash to record against it.',
        },
        { status: 409 }
      );
    }

    const raw = String(body.amount_received_dollars).trim();

    if (raw === '') {
      /* Cleared, for a figure typed in wrong. The row goes back to having
         nothing counted against it, which is what it was before, so the
         timestamp goes with the amount: a date without a figure would say
         somebody counted and record nothing they counted. */
      patch.amount_received_cents = null;
      patch.amount_received_at = null;
    } else {
      const cents = centsFromDollars(raw);
      if (cents === undefined) {
        return NextResponse.json(
          { ok: false, error: 'Enter the amount as dollars, like 25 or 22.50.' },
          { status: 400 }
        );
      }
      patch.amount_received_cents = cents;
      /* Its own column, deliberately not paid_at. register_prepaid_vendor
         stamps paid_at at submission, so re-stamping it here would leave one
         column meaning "submitted" on the rows nobody has reconciled and "cash
         counted" on the rows somebody has. Two meanings in one column on a
         money record is how the books stop being readable. */
      patch.amount_received_at = new Date().toISOString();
    }

    receivedChanged = true;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, error: 'Nothing to change.' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('vendor_applications')
    .update(patch)
    .eq('id', id)
    .select(
      'id, approval_status, spot_number, event_slug, amount_received_cents, amount_received_at'
    )
    .single();

  if (error || !data) {
    console.error('admin update failed', error);
    return NextResponse.json({ ok: false, error: 'Could not save that.' }, { status: 500 });
  }

  invalidateSpots(data.event_slug);

  return NextResponse.json({ ok: true, row: data, receivedChanged });
}
