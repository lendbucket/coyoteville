import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { invalidateSpots } from '@/lib/spots';
import { findPaymentIdForOrder, refundPaymentInFull } from '@/lib/square';
import { notifyApproved, notifyDenied } from '@/lib/notify';
import { EVENTS } from '@/lib/seo';
import type { RegistrationEmail } from '@/lib/notify-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approve or deny one application.
 *
 * Payment no longer confirms a spot, so this route is the thing that does.
 * Approving stamps the row and sends the confirmation the vendor has been
 * waiting on. Denying refunds the fee in full, frees the spot, and sends the
 * decision with the reason attached.
 *
 * Two rules run through the whole handler:
 *
 *   The decision is claimed before anything irreversible happens. The update is
 *   conditional on the row still being 'pending', so two taps, two tabs, or a
 *   retry cannot produce two refunds or two emails. Whoever loses that race
 *   gets told the application was already reviewed.
 *
 *   A failed refund never rolls the denial back. By the time Square is called
 *   the spot has already been handed back to the meter and the decision is
 *   made. The failure is written to the row and returned to the tracker so it
 *   can be settled by hand, which is a far better outcome than a vendor sitting
 *   in limbo because a card network was down.
 */

const COLUMNS =
  'id, business_name, contact_name, phone, email, spot_type, event_slug, sells, notes, ' +
  'serves_food, permit_path, signature_name, signed_at, agreement_version, amount_cents, ' +
  'payment_status, payment_method, approval_status, square_order_id, square_payment_id';

type Row = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  event_slug: string;
  sells: string;
  notes: string | null;
  serves_food: boolean | null;
  permit_path: string | null;
  signature_name: string;
  signed_at: string | null;
  agreement_version: string | null;
  amount_cents: number | null;
  payment_status: string;
  payment_method: string | null;
  approval_status: string;
  square_order_id: string | null;
  square_payment_id: string | null;
};

function toEmail(row: Row): RegistrationEmail {
  return {
    id: row.id,
    business_name: row.business_name,
    contact_name: row.contact_name,
    phone: row.phone,
    email: row.email,
    spot_type: row.spot_type,
    event_slug: row.event_slug,
    event_name: EVENTS.find((e) => e.slug === row.event_slug)?.name ?? row.event_slug,
    sells: row.sells,
    notes: row.notes,
    serves_food: Boolean(row.serves_food),
    permit_uploaded: Boolean(row.permit_path),
    signature_name: row.signature_name,
    signed_at: row.signed_at,
    agreement_version: row.agreement_version,
    amount_cents: row.amount_cents ?? 0,
    payment_status: row.payment_status,
    payment_method: (row.payment_method as 'online' | 'offline' | null) ?? null,
  };
}

/** Money that is actually sitting with Square and can be sent back. */
function refundableCents(row: Row): number {
  if (row.payment_status !== 'paid') return 0;
  // A prepaid vendor paid by phone or in person. There is no online payment to
  // reverse, so this is settled off the site and the email says nothing about a
  // card refund.
  if (row.payment_method === 'offline') return 0;
  return Math.max(0, row.amount_cents ?? 0);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    decision?: string;
    reason?: string;
  } | null;

  const id = String(body?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Bad application id.' }, { status: 400 });
  }

  const decision = String(body?.decision ?? '');
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json({ ok: false, error: 'Unknown decision.' }, { status: 400 });
  }

  // The reason is not optional and not a formality: it is reproduced verbatim
  // in the email the vendor reads, so an empty one would send them a blank
  // explanation.
  const reason = String(body?.reason ?? '').trim().slice(0, 600);
  if (decision === 'deny' && reason.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'Write a reason of at least 10 characters. It goes in the email.' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  /* Claim the decision. Conditional on 'pending', so only one caller can ever
     win it and only the winner goes on to refund and email. */
  const patch: Record<string, unknown> =
    decision === 'approve'
      ? { approval_status: 'approved', reviewed_at: now, denial_reason: null, updated_at: now }
      : { approval_status: 'denied', reviewed_at: now, denial_reason: reason, updated_at: now };

  const { data, error } = await supabase
    .from('vendor_applications')
    .update(patch)
    .eq('id', id)
    .eq('approval_status', 'pending')
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('review update failed', id, error);
    return NextResponse.json({ ok: false, error: 'Could not save that decision.' }, { status: 500 });
  }

  if (!data) {
    // Either the id is wrong or somebody already reviewed it. Read it back so
    // the tracker can say which, rather than showing a bare failure.
    const { data: current } = await supabase
      .from('vendor_applications')
      .select('approval_status')
      .eq('id', id)
      .maybeSingle();

    return NextResponse.json(
      {
        ok: false,
        error: current
          ? `That application is already marked ${current.approval_status}.`
          : 'That application no longer exists.',
      },
      { status: 409 }
    );
  }

  const row = data as unknown as Row;

  // The spot is either confirmed or released. Either way the meter is stale.
  invalidateSpots(row.event_slug);

  /* ------------------------------------------------------------ approve */

  if (decision === 'approve') {
    await notifyApproved(toEmail(row));
    return NextResponse.json({ ok: true, approval_status: 'approved' });
  }

  /* --------------------------------------------------------------- deny */

  const owed = refundableCents(row);
  let refundedCents = 0;
  let refundError: string | null = null;

  if (owed > 0) {
    // Older rows predate square_payment_id, so fall back to the tenders on the
    // order rather than refusing to refund a real payment.
    const paymentId =
      row.square_payment_id ??
      (row.square_order_id ? await findPaymentIdForOrder(row.square_order_id) : null);

    if (!paymentId) {
      refundError = 'No Square payment could be found for this application. Refund it by hand.';
    } else {
      const outcome = await refundPaymentInFull({
        paymentId,
        amountCents: owed,
        // Derived from the application, never random, so a retry cannot refund
        // the same payment twice.
        idempotencyKey: `cvdeny-${row.id}`,
        reason: 'Coyoteville vendor application not accepted',
      });

      if (outcome.ok) {
        refundedCents = outcome.amountCents;
      } else {
        refundError = outcome.error;
      }
    }
  } else if (row.payment_method === 'offline' && row.payment_status === 'paid') {
    refundError = 'This vendor paid outside the website, so refund them the way they paid.';
  }

  const refundPatch: Record<string, unknown> = {
    refund_error: refundError,
    updated_at: new Date().toISOString(),
  };

  if (refundedCents > 0) {
    refundPatch.payment_status = 'refunded';
    refundPatch.refund_amount_cents = refundedCents;
    refundPatch.refunded_at = new Date().toISOString();
  }

  const { error: refundWriteError } = await supabase
    .from('vendor_applications')
    .update(refundPatch)
    .eq('id', row.id);

  if (refundWriteError) {
    // The refund itself may well have gone through, so this is logged loudly
    // rather than retried, which could double refund.
    console.error('could not record refund outcome', row.id, refundWriteError);
  }

  /* The vendor is told either way. The email promises the refund even when the
     automatic one failed, because the money is owed regardless and the tracker
     is already flagging it for the admin to settle. */
  await notifyDenied({
    ...toEmail(row),
    reason,
    refund_amount_cents: refundedCents > 0 ? refundedCents : owed,
  });

  return NextResponse.json({
    ok: true,
    approval_status: 'denied',
    refundedCents,
    refundError,
  });
}
