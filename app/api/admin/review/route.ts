import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { invalidateSpots } from '@/lib/spots';
import { findPaymentIdForOrder, refundPaymentInFull } from '@/lib/square';
import {
  mapSubscriptionStatus,
  releaseCardOnFile,
  startSubscription,
} from '@/lib/subscriptions';
import { MONTHLY_PRICING, addMonth, formatDayLong, isMonthlySpot } from '@/lib/booking';
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
  'payment_status, payment_method, approval_status, square_order_id, square_payment_id, ' +
  'booking_kind, booking_date, square_customer_id, square_card_id, monthly_amount_cents';

type Row = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  event_slug: string | null;
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
  booking_kind: string;
  booking_date: string | null;
  square_customer_id: string | null;
  square_card_id: string | null;
  monthly_amount_cents: number | null;
};

/**
 * What the vendor booked, in the words the emails use.
 *
 * The templates take a single `event_name`, so a day booking hands them the
 * date and a permanent spot hands them its label. That keeps one set of
 * templates reading correctly for all three kinds rather than branching on the
 * booking kind in every sentence.
 */
function bookingLabel(row: Row): string {
  if (row.booking_kind === 'day' && row.booking_date) return formatDayLong(row.booking_date);
  if (row.booking_kind === 'monthly') {
    return isMonthlySpot(row.spot_type)
      ? MONTHLY_PRICING[row.spot_type].label
      : 'Permanent monthly spot';
  }
  return EVENTS.find((e) => e.slug === row.event_slug)?.name ?? row.event_slug ?? 'Coyoteville';
}

function toEmail(row: Row): RegistrationEmail {
  return {
    id: row.id,
    business_name: row.business_name,
    contact_name: row.contact_name,
    phone: row.phone,
    email: row.email,
    spot_type: row.spot_type,
    event_slug: row.event_slug ?? '',
    event_name: bookingLabel(row),
    sells: row.sells,
    notes: row.notes,
    serves_food: Boolean(row.serves_food),
    permit_uploaded: Boolean(row.permit_path),
    signature_name: row.signature_name,
    signed_at: row.signed_at,
    agreement_version: row.agreement_version,
    amount_cents:
      row.booking_kind === 'monthly'
        ? (row.monthly_amount_cents ?? row.amount_cents ?? 0)
        : (row.amount_cents ?? 0),
    payment_status: row.payment_status,
    payment_method: (row.payment_method as 'online' | 'offline' | null) ?? null,
    booking_kind: row.booking_kind,
    /* When they are actually setting up. An event booking leaves this empty so
       the confirmation falls back to the calendar the way it always did; the
       other two would otherwise be told the date of an event they never
       booked. */
    booking_when:
      row.booking_kind === 'day' && row.booking_date
        ? formatDayLong(row.booking_date)
        : row.booking_kind === 'monthly'
          ? 'every day, until you cancel'
          : undefined,
  };
}

/** Money that is actually sitting with Square and can be sent back. */
function refundableCents(row: Row): number {
  /* A monthly application has never been charged. The card was authorised and
     held at signup and the subscription only starts on approval, so a denial
     unwinds by releasing the card rather than by refunding anything. */
  if (row.booking_kind === 'monthly') return 0;
  if (row.payment_status !== 'paid') return 0;
  // A prepaid vendor paid by phone or in person. There is no online payment to
  // reverse, so this is settled off the site and the email says nothing about a
  // card refund.
  if (row.payment_method === 'offline') return 0;
  return Math.max(0, row.amount_cents ?? 0);
}

/**
 * Start billing an approved permanent spot and record what Square said.
 *
 * Kept out of the handler because the write back is several fields and the
 * handler is already carrying the decision, the refund and the email.
 */
async function startMonthlySubscription(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  row: Row
): Promise<
  { ok: true; status: string; nextChargeDate: string | null } | { ok: false; error: string }
> {
  if (!isMonthlySpot(row.spot_type)) {
    return { ok: false, error: 'This row is a monthly booking with no monthly spot type.' };
  }

  if (!row.square_customer_id || !row.square_card_id) {
    return {
      ok: false,
      error: 'No card is on file for this vendor, so billing could not start. Take a card by phone.',
    };
  }

  const started = await startSubscription({
    applicationId: row.id,
    customerId: row.square_customer_id,
    cardId: row.square_card_id,
    spot: row.spot_type,
  });

  if (!started.ok) return { ok: false, error: started.error };

  const status = mapSubscriptionStatus(started.value.status);
  /* Paid through, as Square sees it. Square only fills chargedThroughDate once
     it has actually billed, so on the very first call it can be absent, and a
     month on from the start date is the honest answer until the first invoice
     webhook arrives with the real one. */
  const periodEnd = started.value.chargedThroughDate ?? addMonth(started.value.startDate);

  const { error } = await supabase
    .from('vendor_applications')
    .update({
      square_subscription_id: started.value.subscriptionId,
      subscription_status: status,
      subscription_started_at: new Date().toISOString(),
      subscription_period_end: periodEnd,
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      refund_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (error) {
    // The subscription is live at Square. Failing loudly here is right: the
    // alternative is retrying and creating a second one.
    console.error('subscription started but could not be recorded', row.id, error);
    return {
      ok: false,
      error: `Billing started at Square as ${started.value.subscriptionId} but could not be saved here. Check the row before approving anything else.`,
    };
  }

  return { ok: true, status, nextChargeDate: periodEnd };
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

  /* The spot is either confirmed or released, so the meter is stale either way.
     A day or monthly decision is not scoped to one event, and a monthly one
     moves every event's numbers, so those clear the whole cache. */
  invalidateSpots(row.booking_kind === 'event' ? row.event_slug ?? undefined : undefined);

  /* ------------------------------------------------------------ approve */

  if (decision === 'approve') {
    /* A permanent spot starts billing here and nowhere else. The card has been
       sitting on file untouched since signup, which is exactly what the vendor
       was told would happen, and this is the first charge. */
    if (row.booking_kind === 'monthly') {
      const outcome = await startMonthlySubscription(supabase, row);

      if (!outcome.ok) {
        /* The approval stands: the decision is made and the spot is theirs.
           What failed is the billing, which is a job for a person, so it is
           written to the row and handed back to the tracker rather than
           silently swallowed or rolled back into the queue. */
        await supabase
          .from('vendor_applications')
          .update({ refund_error: outcome.error, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        await notifyApproved(toEmail(row));

        return NextResponse.json({
          ok: true,
          approval_status: 'approved',
          subscriptionError: outcome.error,
        });
      }

      await notifyApproved(toEmail(row));

      return NextResponse.json({
        ok: true,
        approval_status: 'approved',
        subscriptionStatus: outcome.status,
        nextChargeDate: outcome.nextChargeDate,
      });
    }

    await notifyApproved(toEmail(row));
    return NextResponse.json({ ok: true, approval_status: 'approved' });
  }

  /* --------------------------------------------------------------- deny */

  const owed = refundableCents(row);
  let refundedCents = 0;
  let refundError: string | null = null;
  /** Extra columns the unwind wants set, which differ by booking kind. */
  const refundPatchExtra: Record<string, unknown> = {};

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
  } else if (row.booking_kind === 'monthly') {
    /* Nothing was ever charged, so the unwind is releasing the card we have
       been holding. A failure here is worth flagging but is not money owed:
       the vendor is not out anything either way. */
    if (row.square_card_id) {
      const released = await releaseCardOnFile(row.square_card_id);
      if (!released.ok) {
        refundError = `The card on file could not be released: ${released.error}. Remove it in Square.`;
      }
    }

    refundPatchExtra.subscription_status = 'canceled';
    refundPatchExtra.subscription_canceled_at = new Date().toISOString();
  } else if (row.payment_method === 'offline' && row.payment_status === 'paid') {
    refundError = 'This vendor paid outside the website, so refund them the way they paid.';
  }

  const refundPatch: Record<string, unknown> = {
    ...refundPatchExtra,
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
