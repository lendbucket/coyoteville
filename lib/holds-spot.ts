import { RELEASING_STATUSES } from './approval';

/**
 * Does this application hold a spot right now?
 *
 * One rule, in one place, because it was in three and they disagreed. The event
 * meter released only 'denied', a value the database could not store, so it
 * released nothing. The day calendar used a different rule again. Five
 * abandoned checkouts held five spots for days, and the homepage advertised two
 * booths left on a night when five were free, four days before the event.
 *
 * A spot is held when:
 *
 *   the money has settled, paid or not_required, or
 *   the money has not settled but the checkout started in the last 30 minutes
 *
 * and the application has not been denied or cancelled.
 *
 * The thirty minutes is the whole point of the second clause. Square creates
 * the order before the card is charged, so a vendor part way through checkout
 * has a real unpaid row and their spot has to be held or two people can buy the
 * last one at once. A vendor who walked away an hour ago is not mid checkout,
 * and their row should not be standing on a space nobody is coming to.
 */

/** How long an unpaid row counts as a checkout in progress. */
export const CHECKOUT_WINDOW_MS = 30 * 60 * 1000;

/** Money that has actually settled. */
export const SETTLED_PAYMENT_STATUSES = ['paid', 'not_required'] as const;

/** Decisions that release a spot back to the meter. */
export const RELEASED_APPROVAL_STATUSES = RELEASING_STATUSES;

/**
 * Has the money settled?
 *
 * 'paid' is a Square payment that cleared or a prepaid row booked through the
 * retired link. 'not_required' is a free organisation spot, confirmed the
 * moment it is submitted; it carries amount_cents 0, so counting it cannot move
 * a dollar figure. This test was written out longhand in four places, which is
 * three too many for a rule that decides both what holds a spot and what counts
 * as collected.
 */
export function isSettled(paymentStatus: string | null | undefined): boolean {
  return (SETTLED_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus ?? 'unpaid');
}

export type HoldsSpotRow = {
  payment_status: string | null;
  approval_status: string | null;
  created_at: string | null;
};

export function holdsSpot(row: HoldsSpotRow, now: number = Date.now()): boolean {
  const approval = row.approval_status ?? 'pending';
  if ((RELEASED_APPROVAL_STATUSES as readonly string[]).includes(approval)) return false;

  const payment = row.payment_status ?? 'unpaid';
  if (isSettled(payment)) return true;

  /* Unpaid. Only a checkout that is plausibly still open holds anything. A
     refunded or expired row holds nothing regardless of age. */
  if (payment !== 'unpaid') return false;

  const started = row.created_at ? Date.parse(row.created_at) : NaN;
  if (!Number.isFinite(started)) return false;

  return now - started < CHECKOUT_WINDOW_MS;
}

/**
 * Is this an abandoned checkout that should be aged out?
 *
 * Square made an order, no payment ever arrived, and it has been a day. That is
 * not a decision anybody made, so it becomes 'cancelled' rather than 'denied':
 * 'denied' means Robert looked at an application and said no, and it refunds.
 * Keeping the two apart is what stops the tracker's denied list filling up with
 * people who simply closed a tab.
 */
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

export function isAbandonedCheckout(
  row: HoldsSpotRow & { square_order_id: string | null; square_payment_id: string | null },
  now: number = Date.now()
): boolean {
  if ((row.payment_status ?? 'unpaid') !== 'unpaid') return false;
  if ((row.approval_status ?? 'pending') !== 'pending') return false;
  if (!row.square_order_id) return false;
  if (row.square_payment_id) return false;

  const started = row.created_at ? Date.parse(row.created_at) : NaN;
  if (!Number.isFinite(started)) return false;

  return now - started > ABANDON_AFTER_MS;
}
