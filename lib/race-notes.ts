import { lastStampFrom, stampNote } from './note-stamps';

/**
 * Stamps written into race_registrations.admin_notes.
 *
 * Two things have to be legible on a row long after the night they happened:
 * that somebody was sent a payment link, and that a checkout was never created
 * for them in the first place. Both live in admin_notes because the columns are
 * fixed and neither is worth a migration, and both are appended rather than
 * replacing what is there, so a row keeps its whole history.
 *
 * The stamp format is shared with the vendor side rather than reinvented, so
 * one reader understands both.
 */

/** The admin sent this runner a payment link by hand, from the tracker. */
export const RACE_PAY_LINK_MARKER = 'Payment link sent';

/**
 * The registration was written and Square never returned a link.
 *
 * This is the orphan. The runner signed everything, owes money, and has no way
 * to pay, and without this marker the row is indistinguishable from somebody
 * who opened checkout and wandered off. One of those needs chasing tonight and
 * the other does not.
 */
export const RACE_CHECKOUT_FAILED_MARKER = 'Checkout never created';

export function lastPayLinkFrom(adminNotes: string | null): string | null {
  return lastStampFrom(adminNotes, RACE_PAY_LINK_MARKER);
}

export function payLinkNote(now: Date = new Date()): string {
  return stampNote(RACE_PAY_LINK_MARKER, now);
}

export function lastCheckoutFailureFrom(adminNotes: string | null): string | null {
  return lastStampFrom(adminNotes, RACE_CHECKOUT_FAILED_MARKER);
}

export function checkoutFailedNote(now: Date = new Date()): string {
  return stampNote(RACE_CHECKOUT_FAILED_MARKER, now);
}

/** Append a stamp to whatever the row already carries. */
export function appendNote(existing: string | null, stamp: string): string {
  return [existing, stamp].filter(Boolean).join(' · ');
}
