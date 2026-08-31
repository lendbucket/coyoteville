import 'server-only';
import { randomUUID } from 'crypto';
import { getSquare, getSquareLocationId, isSquareConfigured } from './square';
import { getSupabaseAdmin } from './supabase';
import { PRICING, SITE_URL } from './seo';

/**
 * The one place a Square payment link for a vendor spot is created.
 *
 * There are two callers: a vendor finishing the signup form, and the admin
 * asking the tracker to send someone a link after the fact. They must produce
 * the same thing, because the webhook that settles the payment does not know
 * or care which one made it. It maps a completed payment back to an
 * application through the order's referenceId, and nothing else, so an order
 * created any other way settles against no row at all.
 *
 * That is the whole reason this is a shared function rather than two similar
 * blocks. The referenceId contract is invisible from either call site and easy
 * to get subtly wrong in a second copy.
 */

/** The public name of a spot type, as it appears on a Square receipt. */
export function spotLabelFor(spotType: string): string {
  if (spotType === 'truck') return PRICING.truck.label;
  if (spotType === 'booth') return PRICING.booth.label;
  return PRICING.free.label;
}

export type VendorPaymentLink = {
  checkoutUrl: string;
  paymentLinkId: string | null;
  orderId: string | null;
};

/**
 * Create a Square payment link for one application and record it on the row.
 *
 * Throws on anything that leaves us without a usable URL. Both callers treat a
 * throw as "the application is saved, the payment handoff is not", which is the
 * only honest thing to report: nothing has been charged either way.
 */
export async function createVendorPaymentLink(args: {
  /** The application UUID. Becomes the order's referenceId. */
  applicationId: string;
  amountCents: number;
  spotType: string;
  /** What they booked: an event name or a formatted date. Names the line item. */
  bookingLabel: string;
  /** A human date for the line item note. Falls back to bookingLabel. */
  whenLabel?: string;
  buyerEmail: string;
}): Promise<VendorPaymentLink> {
  if (!isSquareConfigured()) {
    throw new Error('Square is not configured.');
  }

  if (!Number.isFinite(args.amountCents) || args.amountCents <= 0) {
    throw new Error('There is nothing to charge on this application.');
  }

  const square = getSquare();
  const locationId = getSquareLocationId();
  const spotLabel = spotLabelFor(args.spotType);
  const when = args.whenLabel || args.bookingLabel;

  // A full order rather than quickPay, because only an order carries
  // referenceId. That id is the application UUID and it is how the webhook
  // maps a completed payment back to the right row.
  const response = await square.checkout.paymentLinks.create({
    idempotencyKey: randomUUID(),
    description: `${spotLabel} at Coyoteville`,
    order: {
      locationId,
      referenceId: args.applicationId,
      lineItems: [
        {
          // bookingLabel is the event name or the date, whichever this is, so
          // the Square receipt names the thing the vendor actually bought.
          name: `${spotLabel}, ${args.bookingLabel || 'Coyoteville'}`,
          quantity: '1',
          basePriceMoney: {
            amount: BigInt(args.amountCents),
            currency: 'USD',
          },
          note: `${when} at Coyoteville, 150 N. Stadium Road, Alice TX.`.trim(),
        },
      ],
    },
    checkoutOptions: {
      redirectUrl: `${SITE_URL}/vendors/confirmed?spot=${args.spotType}`,
      askForShippingAddress: false,
      allowTipping: false,
    },
    prePopulatedData: {
      buyerEmail: args.buyerEmail,
    },
    paymentNote: `Coyoteville vendor spot, application ${args.applicationId}`,
  });

  const paymentLink = response.paymentLink;
  const checkoutUrl = paymentLink?.url || paymentLink?.longUrl || null;

  if (!checkoutUrl) {
    throw new Error('Square returned no payment link URL.');
  }

  /* Recorded here rather than by each caller, so a link can never exist in
     Square that the row does not know about. square_order_id is what the
     abandoned list keys off, and square_payment_link_id is what a resend reads
     back to recover the URL. */
  const { error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .update({
      square_order_id: paymentLink?.orderId ?? null,
      square_payment_link_id: paymentLink?.id ?? null,
    })
    .eq('id', args.applicationId);

  if (error) {
    // The link is live and the vendor can pay on it, so this is not fatal. It
    // costs the row its record of which link is current, which is worth
    // knowing about in the logs.
    console.error('payment link created but not recorded on the row', args.applicationId, error);
  }

  return {
    checkoutUrl,
    paymentLinkId: paymentLink?.id ?? null,
    orderId: paymentLink?.orderId ?? null,
  };
}
