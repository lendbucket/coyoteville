/**
 * The review decision on an application.
 *
 * Payment does not confirm a spot. A vendor signs, pays, and then sits at
 * 'pending' until someone looks at them in the tracker. Approving is what makes
 * the spot real and sends the confirmation. Denying refunds the fee in full and
 * releases the spot back to the meter the same moment.
 *
 * No 'server-only' import, so the client components that render a decision and
 * the email templates that explain one can both read from here.
 */

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'waitlist',
  'denied',
  'cancelled',
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  waitlist: 'Waitlist',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return APPROVAL_STATUSES.includes(value as ApprovalStatus);
}

/**
 * Decisions that release a spot back to the meter.
 *
 * A denied or cancelled application stops holding capacity the instant it is
 * marked, which is the whole point: the admin has to be able to deny someone
 * and see the spot come free without waiting on a refund to settle.
 */
export const RELEASING_STATUSES = ['denied', 'cancelled'] as const;

/** How long a vendor is told to expect to wait. Used in copy, nowhere else. */
export const REVIEW_WINDOW = 'within 48 hours';

/** How long a refund takes to land, in the words used to the vendor. */
export const REFUND_WINDOW = 'five to ten business days';

/**
 * The one sentence that has to be true everywhere a vendor is asked to pay:
 * on the form, in the agreement, on the confirmation screen, and in the email.
 * Repeated verbatim rather than paraphrased, because a vendor who reads it
 * twice and sees two different promises has been told nothing.
 */
export const REVIEW_PROMISE =
  `Payment reserves your place in the review queue. It does not confirm your spot. ` +
  `We review every application ${REVIEW_WINDOW}. If we cannot accommodate you, ` +
  `you are refunded in full automatically.`;
