import 'server-only';
import { SquareClient, SquareEnvironment } from 'square';

/**
 * Server-only Square client. Built lazily so a missing token never breaks the
 * build, only the request that actually needs it.
 *
 * SQUARE_ENVIRONMENT is 'production' or 'sandbox'. Anything other than
 * 'production' resolves to sandbox, so a typo can never accidentally charge a
 * real card.
 */

let cached: SquareClient | null = null;

export function getSquareEnvironment(): SquareEnvironment {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;
}

export function getSquare(): SquareClient {
  if (cached) return cached;

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Square is not configured. Set SQUARE_ACCESS_TOKEN.');
  }

  cached = new SquareClient({
    token,
    environment: getSquareEnvironment(),
  });

  return cached;
}

export function getSquareLocationId(): string {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error('Square is not configured. Set SQUARE_LOCATION_ID.');
  }
  return locationId;
}

export function isSquareConfigured(): boolean {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

/* ------------------------------------------------------------- refunds */

export type RefundOutcome =
  | { ok: true; refundId: string | null; amountCents: number; status: string | null }
  | { ok: false; error: string };

/**
 * The payment id behind an order.
 *
 * Rows created since the approval workflow landed carry square_payment_id,
 * captured by the webhook. Anything older only has the order, so the tenders on
 * it are read instead: a card tender's paymentId is the payment the Refunds API
 * wants. Returns null when there is nothing to refund against, which the caller
 * reports rather than treating as a failed refund.
 */
export async function findPaymentIdForOrder(orderId: string): Promise<string | null> {
  try {
    const order = (await getSquare().orders.get({ orderId })).order;
    for (const tender of order?.tenders ?? []) {
      const paymentId = tender.paymentId ?? tender.id;
      if (paymentId) return paymentId;
    }
    return null;
  } catch (err) {
    console.error('could not resolve a payment id from order', orderId, err);
    return null;
  }
}

/**
 * Refund a vendor's fee in full.
 *
 * Called when an application is denied. Never throws: a refund that does not go
 * through must not undo the denial, because the spot has already been handed
 * back and the vendor has already been told. The failure comes back as a
 * message the tracker shows and the row records, so it can be settled by hand
 * in Square.
 *
 * `idempotencyKey` is derived from the application id rather than generated, so
 * a retry, a double tap, or a second deploy processing the same denial cannot
 * refund the same payment twice. Square dedupes on it for 24 hours.
 */
export async function refundPaymentInFull(args: {
  paymentId: string;
  amountCents: number;
  idempotencyKey: string;
  reason?: string;
}): Promise<RefundOutcome> {
  if (!isSquareConfigured()) {
    return { ok: false, error: 'Square is not connected, so nothing could be refunded.' };
  }

  if (args.amountCents <= 0) {
    return { ok: false, error: 'There is no fee on this application to refund.' };
  }

  try {
    const response = await getSquare().refunds.refundPayment({
      // Square caps this at 45 characters, which a 36 character uuid plus the
      // prefix stays under.
      idempotencyKey: args.idempotencyKey.slice(0, 45),
      paymentId: args.paymentId,
      amountMoney: { amount: BigInt(args.amountCents), currency: 'USD' },
      // Square shows this on the refund in the dashboard and on the statement.
      reason: (args.reason ?? 'Vendor application not accepted').slice(0, 192),
    });

    const refund = response.refund;

    if (!refund) {
      const message = response.errors?.[0]?.detail || 'Square did not return a refund.';
      console.error('square refund returned no refund', args.paymentId, response.errors);
      return { ok: false, error: message };
    }

    // PENDING is a success: card refunds settle over the following days, which
    // is exactly what the vendor is told to expect.
    if (refund.status === 'FAILED') {
      return { ok: false, error: 'Square rejected the refund.' };
    }

    return {
      ok: true,
      refundId: refund.id ?? null,
      amountCents: Number(refund.amountMoney?.amount ?? args.amountCents),
      status: refund.status ?? null,
    };
  } catch (err) {
    console.error('square refund failed', args.paymentId, err);
    const detail =
      (err as { errors?: { detail?: string }[] })?.errors?.[0]?.detail ||
      (err as Error)?.message ||
      'The refund could not be sent to Square.';
    return { ok: false, error: detail };
  }
}
