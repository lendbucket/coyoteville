import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isSquareConfigured } from '@/lib/square';
import { createVendorPaymentLink, spotLabelFor } from '@/lib/payment-link';
import { renderPaymentRequest } from '@/lib/email/payment-request';
import { sendReminderEmail } from '@/lib/notify';
import { lastPaymentRequestFrom, paymentRequestNote } from '@/lib/abandoned';
import { formatDayLong } from '@/lib/booking';
import { supportEmail } from '@/lib/support';
import { EVENTS } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a Square payment link for one vendor and email it to them.
 *
 * For the vendor who is in, has signed, and has never actually been asked for
 * money. The prepaid link is gone and there is no offline path for a new
 * registration, so everybody left owing pays through Square, and this is how
 * they get asked.
 *
 * Not the same thing as the reminder in app/api/admin/abandoned. That one
 * resends the link a vendor already has and refuses when there is none, which
 * is exactly the case this exists for: a row that came in through the retired
 * prepaid path has no square_payment_link_id at all. This one creates the link.
 *
 * It fires on a tap and never on its own. There is no scheduler behind it, no
 * retry, and no follow up. Chasing somebody is a decision, not a cron job.
 */

/**
 * Rows this action refuses, with the reason shown in the tracker.
 *
 * Deliberately an allow list on payment_status rather than "anything that is
 * not paid". payment_status also carries 'refunded' and 'expired', and a
 * refunded row is somebody who was denied and given their money back: mailing
 * them a payment link would be the worst possible message to send by accident.
 *
 * The same three rules as owesPayment() in components/admin/types, which is
 * what decides whether the button appears at all. They have to agree, or the
 * tracker offers an action that then fails.
 */
function refuseReason(row: {
  payment_status: string | null;
  booking_kind: string | null;
  amount_cents: number | null;
}): string | null {
  if (row.payment_status === 'paid') {
    return 'That vendor has already paid.';
  }

  /* A free organization spot is 'not_required', not 'unpaid'. There is nothing
     to charge and a $0 Square link is not a thing. */
  if (row.payment_status === 'not_required') {
    return 'That is a free spot, so there is nothing to charge.';
  }

  if (row.payment_status !== 'unpaid') {
    return `This application is marked '${row.payment_status ?? 'unknown'}', not unpaid, so it is not owed. Fix the row first if that is wrong.`;
  }

  /* A permanent monthly vendor pays through a Square subscription that starts
     on approval. A one-off payment link would take a single month's money
     outside the subscription and leave the recurring billing unstarted. */
  if (row.booking_kind === 'monthly') {
    return 'A permanent monthly spot bills through its subscription, not a payment link. Use the subscription controls.';
  }

  if (!row.amount_cents || row.amount_cents <= 0) {
    return 'There is no fee recorded on this application to charge.';
  }

  return null;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? '');

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Bad application id.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from('vendor_applications')
    .select(
      'id, business_name, contact_name, email, spot_type, event_slug, booking_kind, booking_date, amount_cents, payment_status, approval_status, admin_notes'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ ok: false, error: 'Application not found.' }, { status: 404 });
  }

  const refusal = refuseReason(row);
  if (refusal) {
    return NextResponse.json({ ok: false, error: refusal }, { status: 409 });
  }

  if (!row.email) {
    return NextResponse.json(
      { ok: false, error: 'No email address on this application, so there is nowhere to send it.' },
      { status: 409 }
    );
  }

  if (!isSquareConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Square is not connected, so no payment link can be created.' },
      { status: 503 }
    );
  }

  /* What they booked, formatted the same way the tracker and the card show it,
     so the email names the thing the vendor recognises. Monthly is refused
     above, so this is an event or a single date. */
  const event = EVENTS.find((e) => e.slug === row.event_slug);
  const eventLabel =
    row.booking_kind === 'day' && row.booking_date
      ? formatDayLong(row.booking_date)
      : (event?.name ?? 'Coyoteville');
  const whenLabel =
    row.booking_kind === 'day' && row.booking_date
      ? formatDayLong(row.booking_date)
      : (event?.displayDate ?? eventLabel);

  const amountCents = Number(row.amount_cents);

  /* The link first. If the email then fails, the link is live and already
     recorded on the row, so a retry of this action is safe and the abandoned
     list can resend it. The reverse order could email a URL we never stored. */
  let payUrl: string;
  try {
    const link = await createVendorPaymentLink({
      applicationId: row.id,
      amountCents,
      spotType: row.spot_type,
      bookingLabel: eventLabel,
      whenLabel,
      buyerEmail: row.email,
    });
    payUrl = link.checkoutUrl;
  } catch (err) {
    console.error('could not create a payment link for', row.id, err);
    return NextResponse.json(
      { ok: false, error: 'Square did not return a payment link. Nothing was sent.' },
      { status: 502 }
    );
  }

  const message = renderPaymentRequest({
    businessName: row.business_name,
    contactName: row.contact_name,
    eventLabel,
    spotLabel: spotLabelFor(row.spot_type),
    amountCents,
    payUrl,
    /* Only an approved row is told its spot is reserved. Everything else gets
       the same link with a sentence that promises nothing. */
    approved: row.approval_status === 'approved',
    supportEmail: supportEmail(),
  });

  const sent = await sendReminderEmail(row.email, message);

  if (!sent) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'The payment link was created but the email did not go out. The link is on the row, so try again.',
      },
      { status: 502 }
    );
  }

  // Logged only once the send actually succeeded, and appended rather than
  // replaced, so the row keeps the whole history of what was sent when.
  const stamp = paymentRequestNote();
  const note = [row.admin_notes, stamp].filter(Boolean).join(' · ');

  const { error: noteError } = await supabase
    .from('vendor_applications')
    .update({ admin_notes: note, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (noteError) console.error('payment request sent but not logged', id, noteError);

  return NextResponse.json({
    ok: true,
    id,
    sentTo: row.email,
    requestedAt: lastPaymentRequestFrom(stamp),
  });
}
