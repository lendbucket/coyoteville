import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { mapSubscriptionStatus } from './subscriptions';
import { invalidateSpots } from './spots';
import { notifyPaymentFailed, notifySubscriptionRenewed } from './notify';
import { addMonth } from './booking';

/**
 * The recurring lifecycle, as it arrives from Square.
 *
 * Square bills a subscription by raising an invoice each period, so the money
 * events come through as invoice webhooks rather than subscription ones, and
 * the subscription webhook only reports state changes like a cancellation
 * taking effect. Both are handled here so the webhook route stays a router.
 *
 * Everything in this file is keyed off ids Square gave us and stored on the
 * row. Nothing is matched on an email address or a name, because a vendor who
 * changes either would silently stop being findable.
 */

const APPLICATION_COLUMNS =
  'id, business_name, contact_name, phone, email, spot_type, event_slug, sells, notes, ' +
  'serves_food, permit_path, signature_name, signed_at, agreement_version, ' +
  'monthly_amount_cents, amount_cents, payment_status, payment_method, ' +
  'square_subscription_id, subscription_status, subscription_period_end, failed_payment_count, ' +
  'subscription_cancel_at_period_end';

type SubscriptionRow = {
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
  monthly_amount_cents: number | null;
  amount_cents: number | null;
  payment_status: string;
  payment_method: string | null;
  square_subscription_id: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
  failed_payment_count: number;
  subscription_cancel_at_period_end: boolean;
};

async function findBySubscriptionId(subscriptionId: string): Promise<SubscriptionRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .select(APPLICATION_COLUMNS)
    .eq('square_subscription_id', subscriptionId)
    .maybeSingle();

  if (error) {
    console.error('subscription lookup failed', subscriptionId, error);
    return null;
  }

  return (data as unknown as SubscriptionRow) ?? null;
}

/** Shape the notify helpers want, built from a monthly row. */
function toEmail(row: SubscriptionRow, label: string) {
  return {
    id: row.id,
    business_name: row.business_name,
    contact_name: row.contact_name,
    phone: row.phone,
    email: row.email,
    spot_type: row.spot_type,
    event_slug: row.event_slug ?? '',
    event_name: label,
    sells: row.sells,
    notes: row.notes,
    serves_food: Boolean(row.serves_food),
    permit_uploaded: Boolean(row.permit_path),
    signature_name: row.signature_name,
    signed_at: row.signed_at,
    agreement_version: row.agreement_version,
    amount_cents: row.monthly_amount_cents ?? row.amount_cents ?? 0,
    payment_status: row.payment_status,
    payment_method: (row.payment_method as 'online' | 'offline' | null) ?? null,
  };
}

/* ------------------------------------------------------------- renewal */

/**
 * A monthly charge went through.
 *
 * Rolls the paid-through date forward and clears any run of failures, because a
 * card that has just worked is a card that is working whatever it did last
 * month. The vendor gets a short receipt rather than nothing: a silent recurring
 * charge is how a subscription ends up disputed.
 */
export async function handleInvoicePaid(args: {
  subscriptionId: string;
  paidThrough: string | null;
  invoiceStatus: string;
}): Promise<{ handled: boolean; applicationId?: string }> {
  const row = await findBySubscriptionId(args.subscriptionId);
  if (!row) return { handled: false };

  const periodEnd =
    args.paidThrough ??
    addMonth(row.subscription_period_end ?? new Date().toISOString().slice(0, 10));

  const { error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .update({
      payment_status: 'paid',
      // A cancellation already booked stays booked: the vendor keeps the spot
      // until the end of what they have paid for and is not resurrected by a
      // charge that settled in the meantime.
      subscription_status: row.subscription_cancel_at_period_end ? row.subscription_status : 'active',
      subscription_period_end: periodEnd,
      failed_payment_count: 0,
      last_invoice_status: args.invoiceStatus,
      last_invoice_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (error) {
    console.error('could not record subscription renewal', row.id, error);
    return { handled: false };
  }

  invalidateSpots();

  await notifySubscriptionRenewed({
    ...toEmail(row, 'Permanent monthly spot'),
    next_charge_date: periodEnd,
    canceling: row.subscription_cancel_at_period_end,
  });

  return { handled: true, applicationId: row.id };
}

/* -------------------------------------------------------------- failure */

/**
 * A monthly charge did not go through.
 *
 * Square retries a failed subscription invoice on its own schedule before it
 * gives up, so this does not cancel anything. It counts the failure, tells the
 * vendor which card to fix and by when, and tells the owner. The spot is not
 * released here: somebody whose card expired has not resigned, and taking their
 * space away on the first failed charge would be the wrong call.
 */
export async function handleInvoiceFailed(args: {
  subscriptionId: string;
  invoiceStatus: string;
  /** When Square will try again, if it said. */
  retryDate: string | null;
}): Promise<{ handled: boolean; applicationId?: string }> {
  const row = await findBySubscriptionId(args.subscriptionId);
  if (!row) return { handled: false };

  const attempts = (row.failed_payment_count ?? 0) + 1;

  const { error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .update({
      subscription_status: 'past_due',
      failed_payment_count: attempts,
      last_invoice_status: args.invoiceStatus,
      last_invoice_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (error) {
    console.error('could not record failed subscription payment', row.id, error);
    return { handled: false };
  }

  await notifyPaymentFailed({
    ...toEmail(row, 'Permanent monthly spot'),
    attempt: attempts,
    retry_date: args.retryDate,
    paid_through: row.subscription_period_end,
  });

  return { handled: true, applicationId: row.id };
}

/* --------------------------------------------------------- state change */

/**
 * The subscription itself changed state at Square.
 *
 * The one that matters is a cancellation finally taking effect at the end of a
 * paid period, which is when the spot actually comes free. Until that lands the
 * vendor is still setting up and still holding their space, which is why the
 * capacity count keeps them until Square says canceled and not from the moment
 * the cancel button was pressed.
 */
export async function handleSubscriptionUpdated(args: {
  subscriptionId: string;
  status: string | null;
  chargedThroughDate: string | null;
  canceledDate: string | null;
}): Promise<{ handled: boolean; applicationId?: string }> {
  const row = await findBySubscriptionId(args.subscriptionId);
  if (!row) return { handled: false };

  const status = mapSubscriptionStatus(args.status);

  const patch: Record<string, unknown> = {
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  if (args.chargedThroughDate) patch.subscription_period_end = args.chargedThroughDate;
  if (args.canceledDate) patch.subscription_canceled_at = new Date().toISOString();

  const { error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .update(patch)
    .eq('id', row.id);

  if (error) {
    console.error('could not record subscription state change', row.id, error);
    return { handled: false };
  }

  // A spot may have just come free across every date at once.
  invalidateSpots();

  return { handled: true, applicationId: row.id };
}
