import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSquare, isSquareConfigured } from '@/lib/square';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { EVENTS, SITE_URL } from '@/lib/seo';
import { invalidateSpots } from '@/lib/spots';
import { notifyPaymentReceived } from '@/lib/notify';
import {
  handleInvoiceFailed,
  handleInvoicePaid,
  handleSubscriptionUpdated,
} from '@/lib/subscription-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Square webhook.
 *
 * Square signs with an HMAC-SHA256 over the full notification URL concatenated
 * with the raw request body, keyed with the webhook signature key, base64
 * encoded. So the raw text is required and request.json() must never be called
 * before verification.
 *
 * The notification URL has to match what is registered in the Square dashboard
 * byte for byte, including scheme and any trailing path. It is derived from
 * NEXT_PUBLIC_SITE_URL here, so if that is wrong in production every webhook
 * will fail verification.
 */

const NOTIFICATION_URL = `${SITE_URL}/api/square-webhook`;

/** Constant time compare. Length is checked first because timingSafeEqual throws on a mismatch. */
function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function verify(rawBody: string, providedSignature: string, signatureKey: string): boolean {
  const expected = createHmac('sha256', signatureKey)
    .update(NOTIFICATION_URL + rawBody, 'utf8')
    .digest('base64');

  return signaturesMatch(expected, providedSignature);
}

/**
 * The recurring billing events.
 *
 * `invoice.payment_made` is a monthly charge landing. The failure comes through
 * as `invoice.scheduled_charge_failed`, and Square also raises `invoice.updated`
 * with a FAILED status on some accounts, so both are watched and the invoice
 * status is what actually decides which way it is handled.
 *
 * `subscription.updated` carries state changes, of which the one that matters
 * is a cancellation finally taking effect at the end of a paid period.
 */
const SUBSCRIPTION_EVENTS = new Set([
  'invoice.payment_made',
  'invoice.scheduled_charge_failed',
  'invoice.updated',
  'subscription.updated',
]);

type SquareSubscriptionEvent = {
  type?: string;
  data?: {
    object?: {
      invoice?: {
        id?: string;
        status?: string;
        subscription_id?: string;
        payment_requests?: { due_date?: string; computed_amount_money?: { amount?: number } }[];
      };
      subscription?: {
        id?: string;
        status?: string;
        charged_through_date?: string;
        canceled_date?: string;
      };
    };
  };
};

/**
 * Recurring billing.
 *
 * Always answers 200 unless something is genuinely retryable. Square redelivers
 * against a non 2xx for days, and an invoice for a subscription that is not ours
 * would otherwise be redelivered forever.
 */
async function handleSubscriptionEvent(event: SquareSubscriptionEvent) {
  const invoice = event.data?.object?.invoice;
  const subscription = event.data?.object?.subscription;

  try {
    if (event.type === 'subscription.updated' && subscription?.id) {
      const result = await handleSubscriptionUpdated({
        subscriptionId: subscription.id,
        status: subscription.status ?? null,
        chargedThroughDate: subscription.charged_through_date ?? null,
        canceledDate: subscription.canceled_date ?? null,
      });

      return NextResponse.json({
        received: true,
        ...(result.handled ? { applicationId: result.applicationId } : { ignored: 'not ours' }),
      });
    }

    const subscriptionId = invoice?.subscription_id;
    if (!subscriptionId) {
      // A one-off invoice raised somewhere else on the same Square account.
      return NextResponse.json({ received: true, ignored: 'invoice with no subscription' });
    }

    const status = (invoice?.status ?? '').toUpperCase();
    const paid = status === 'PAID';
    const failed = event.type === 'invoice.scheduled_charge_failed' || status === 'FAILED';

    if (!paid && !failed) {
      // DRAFT, UNPAID, SCHEDULED and the rest are steps on the way to one of
      // the two outcomes worth acting on.
      return NextResponse.json({ received: true, ignored: `invoice ${status || 'unknown'}` });
    }

    const result = paid
      ? await handleInvoicePaid({
          subscriptionId,
          // Square puts the period this invoice covers on the payment request.
          paidThrough: invoice?.payment_requests?.[0]?.due_date ?? null,
          invoiceStatus: status || 'PAID',
        })
      : await handleInvoiceFailed({
          subscriptionId,
          invoiceStatus: status || 'FAILED',
          retryDate: invoice?.payment_requests?.[0]?.due_date ?? null,
        });

    return NextResponse.json({
      received: true,
      ...(result.handled ? { applicationId: result.applicationId } : { ignored: 'not ours' }),
    });
  } catch (err) {
    console.error('subscription webhook handler error', event.type, err);
    // Retryable: a database blip should get another delivery.
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }
}

type SquarePaymentEvent = {
  type?: string;
  event_id?: string;
  data?: {
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
        amount_money?: { amount?: number; currency?: string };
      };
    };
  };
};

export async function POST(request: Request) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

  if (!signatureKey || !isSquareConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const providedSignature = request.headers.get('x-square-hmacsha256-signature');
  if (!providedSignature) {
    return NextResponse.json(
      { error: 'Missing x-square-hmacsha256-signature header.' },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  if (!verify(rawBody, providedSignature, signatureKey)) {
    console.error('square webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // Only parse after the signature checks out.
  let event: SquarePaymentEvent;
  try {
    event = JSON.parse(rawBody) as SquarePaymentEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  /* Recurring billing arrives as invoice and subscription events rather than as
     payments, because Square bills a subscription by raising an invoice each
     period. Routed off to their own handlers before the one-off payment path,
     which knows nothing about subscriptions. */
  if (SUBSCRIPTION_EVENTS.has(event.type ?? '')) {
    return handleSubscriptionEvent(event as SquareSubscriptionEvent);
  }

  if (event.type !== 'payment.updated') {
    return NextResponse.json({ received: true, ignored: event.type ?? 'unknown' });
  }

  const payment = event.data?.object?.payment;

  if (!payment || payment.status !== 'COMPLETED') {
    return NextResponse.json({ received: true, ignored: `status ${payment?.status ?? 'none'}` });
  }

  const orderId = payment.order_id;
  if (!orderId) {
    console.warn('payment.updated COMPLETED with no order_id', payment.id);
    return NextResponse.json({ received: true, ignored: 'no order id' });
  }

  try {
    // referenceId on the order is the application UUID we set at checkout.
    const square = getSquare();

    let order;
    try {
      order = (await square.orders.get({ orderId })).order;
    } catch (err) {
      // A 404 or a 403 is permanent: the order is gone or belongs to another
      // account, and Square will keep redelivering for days against a non 2xx.
      // Anything else is worth a retry.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 403) {
        console.warn('square order not retrievable, not retrying', orderId, status);
        return NextResponse.json({ received: true, ignored: `order lookup ${status}` });
      }
      throw err;
    }

    const applicationId = order?.referenceId;

    if (!applicationId) {
      // Every order we create carries one. This is a payment taken somewhere
      // else on the same Square account, so it is not ours to act on.
      return NextResponse.json({ received: true, ignored: 'no reference id' });
    }

    const supabase = getSupabaseAdmin();

    // What the spot actually costs, read from our own row rather than from
    // anything in the webhook. The amount is compared before the row is
    // touched, so a payment that does not cover the spot cannot approve it.
    const { data: existing, error: readError } = await supabase
      .from('vendor_applications')
      .select('id, amount_cents, payment_status')
      .eq('id', applicationId)
      .maybeSingle();

    if (readError) {
      console.error('failed to read application for payment', applicationId, readError);
      return NextResponse.json({ error: 'Database read failed.' }, { status: 500 });
    }

    if (!existing) {
      console.warn('square order references an unknown application', applicationId);
      return NextResponse.json({ received: true, ignored: 'unknown application' });
    }

    if (existing.payment_status !== 'unpaid') {
      return NextResponse.json({ received: true, applicationId, ignored: 'already settled' });
    }

    const expected = Number(existing.amount_cents ?? 0);
    const orderTotal = Number(order?.totalMoney?.amount ?? NaN);
    const stillDue = Number(order?.netAmountDueMoney?.amount ?? NaN);
    const paidNow = Number(payment.amount_money?.amount ?? NaN);

    // This payment on its own covers the spot. Settle without consulting the
    // order at all.
    //
    // The order is the better source for a part paid balance, but it is also a
    // second read that can lag the payment that triggered this delivery. If
    // that read came back mid reconciliation, netAmountDueMoney would still be
    // above zero and every ordinary payment would be refused. Taking the plain
    // case off the order's answer entirely removes that failure mode, which
    // would otherwise land on every vendor at once on the day of the event.
    const coveredByThisPayment = Number.isFinite(paidNow) && paidNow >= expected;

    // Underpayment. Either the order is worth less than the spot we sold, or
    // Square still shows money outstanding on it. If Square reports no figures
    // at all the payment is accepted and the gap is logged, because stranding
    // a vendor who really paid is the worse failure.
    const underpaid =
      !coveredByThisPayment &&
      ((Number.isFinite(orderTotal) && orderTotal < expected) ||
        (Number.isFinite(stillDue) && stillDue > 0));

    if (underpaid) {
      const note = [
        `Payment did not cover the ${expected} cent spot.`,
        Number.isFinite(orderTotal) ? `Square order total ${orderTotal} cents.` : null,
        Number.isFinite(stillDue) && stillDue > 0 ? `${stillDue} cents still outstanding.` : null,
        `Left unpaid on purpose. Check Square order ${orderId}.`,
      ]
        .filter(Boolean)
        .join(' ');
      console.error("[square-webhook] underpaid", JSON.stringify({ applicationId, expected, paidNow, orderTotal, stillDue, orderId }));

      await supabase.from('vendor_applications').update({ admin_notes: note }).eq('id', applicationId);

      // 200 so Square stops redelivering. Retrying cannot make the amount right.
      return NextResponse.json({ received: true, applicationId, ignored: 'underpaid' });
    }

    if (!Number.isFinite(orderTotal) && !Number.isFinite(stillDue)) {
      console.warn('[square-webhook] order carried no amount to verify', orderId);
    }

    // Only rows still waiting on payment are updated. Square retries a webhook
    // until it gets a 2xx, so without this a retry would send a second set of
    // emails for a vendor who was already marked paid.
    const { data: updated, error } = await supabase
      .from('vendor_applications')
      .update({
        payment_status: 'paid',
        payment_method: 'online',
        /* approval_status is deliberately not touched. Settling a payment used
           to approve the application, which is exactly the behaviour the review
           queue exists to remove: the money landing buys a place in the queue,
           and only a person approving it makes the spot real. The row stays at
           whatever it was inserted as, which is 'pending'. */
        square_order_id: orderId,
        // The Refunds API refunds a payment, not an order, so a denial cannot
        // be refunded automatically unless this is captured here.
        square_payment_id: payment.id ?? null,
        paid_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('payment_status', 'unpaid')
      .select(
        'id, business_name, contact_name, phone, email, spot_type, event_slug, sells, notes, serves_food, permit_path, signature_name, signed_at, agreement_version, amount_cents'
      )
      .maybeSingle();

    if (error) {
      console.error('failed to mark application paid', applicationId, error);
      // Non 2xx tells Square to retry, which is what we want here.
      return NextResponse.json({ error: 'Database update failed.' }, { status: 500 });
    }

    if (!updated) {
      // Already settled by an earlier delivery of this event.
      return NextResponse.json({ received: true, applicationId, ignored: 'already paid' });
    }

    invalidateSpots(updated.event_slug);

    // The payment has settled, so this is the point the application joins the
    // review queue. Email goes out here rather than at form submission, which
    // would notify about people who abandoned checkout. A failure is logged
    // inside and can never turn a paid application into an error.
    await notifyPaymentReceived({
      id: updated.id,
      business_name: updated.business_name,
      contact_name: updated.contact_name,
      phone: updated.phone,
      email: updated.email,
      spot_type: updated.spot_type,
      event_slug: updated.event_slug,
      event_name:
        EVENTS.find((e) => e.slug === updated.event_slug)?.name ?? updated.event_slug,
      sells: updated.sells,
      notes: updated.notes,
      serves_food: Boolean(updated.serves_food),
      permit_uploaded: Boolean(updated.permit_path),
      signature_name: updated.signature_name,
      signed_at: updated.signed_at,
      agreement_version: updated.agreement_version,
      amount_cents: updated.amount_cents ?? 0,
      payment_status: 'paid',
      payment_method: 'online',
    });

    return NextResponse.json({ received: true, applicationId });
  } catch (err) {
    console.error('square webhook handler error', event.type, err);
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }
}
