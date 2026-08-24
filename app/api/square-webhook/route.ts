import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSquare, isSquareConfigured } from '@/lib/square';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { SITE_URL } from '@/lib/seo';

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

type SquarePaymentEvent = {
  type?: string;
  event_id?: string;
  data?: {
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
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
    const orderResponse = await square.orders.get({ orderId });
    const applicationId = orderResponse.order?.referenceId;

    if (!applicationId) {
      console.warn('square order has no referenceId', orderId);
      return NextResponse.json({ received: true, ignored: 'no reference id' });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('vendor_applications')
      .update({
        payment_status: 'paid',
        approval_status: 'approved',
        square_order_id: orderId,
        paid_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (error) {
      console.error('failed to mark application paid', applicationId, error);
      // Non 2xx tells Square to retry, which is what we want here.
      return NextResponse.json({ error: 'Database update failed.' }, { status: 500 });
    }

    return NextResponse.json({ received: true, applicationId });
  } catch (err) {
    console.error('square webhook handler error', event.type, err);
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }
}
