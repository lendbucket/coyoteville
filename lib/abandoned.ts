import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { HEALTHCHECK_BUSINESS_NAME } from './healthcheck';
import { ABANDON_AFTER_MS, isAbandonedCheckout } from './holds-spot';

/**
 * Started but not paid.
 *
 * Every application that is still unpaid and had a Square order created for it.
 * There is no age threshold: this is the list to work before the deadline, and
 * a vendor who started five minutes ago still has an unheld spot.
 *
 * A reminder reuses the vendor's original Square payment link rather than
 * creating a new one. The webhook maps a payment back by the order's
 * referenceId, so a second order would settle against the wrong row.
 */

export type AbandonedRow = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  amount_cents: number;
  created_at: string;
  admin_notes: string | null;
  square_payment_link_id: string | null;
  /** Whole minutes since the form was submitted. */
  minutesAgo: number;
  /** When the most recent reminder went out, or null if none has. */
  lastReminderAt: string | null;
};

const REMINDER_MARKER = 'Payment reminder sent';

/**
 * A marked, timestamped line appended to admin_notes.
 *
 * Notes are appended rather than replaced, so a row keeps its whole history
 * and can carry several of these. The most recent stamp for a marker is what
 * the tracker shows.
 *
 * Generic over the marker because there is now more than one thing that leaves
 * a trail here: the reminder that resends an abandoned checkout, and the
 * payment request that creates a link for somebody who never had one. They must
 * stay distinguishable, so they get their own markers and share the parsing.
 */
export function lastStampFrom(adminNotes: string | null, marker: string): string | null {
  if (!adminNotes) return null;

  const stamps = [...adminNotes.matchAll(new RegExp(`${marker} (\\S+)`, 'g'))]
    .map((m) => m[1])
    .filter((s) => !Number.isNaN(Date.parse(s)));

  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

export function stampNote(marker: string, now: Date = new Date()): string {
  return `${marker} ${now.toISOString()}`;
}

export function lastReminderFrom(adminNotes: string | null): string | null {
  return lastStampFrom(adminNotes, REMINDER_MARKER);
}

export function reminderNote(now: Date = new Date()): string {
  return stampNote(REMINDER_MARKER, now);
}

/**
 * The payment request the admin sends by hand from the tracker.
 *
 * Its own marker so it never reads as a reminder. A reminder resends the link a
 * vendor already had; a request creates one for a vendor who never did, which
 * is a different thing to find on a row weeks later.
 */
export const PAYMENT_REQUEST_MARKER = 'Payment request sent';

export function lastPaymentRequestFrom(adminNotes: string | null): string | null {
  return lastStampFrom(adminNotes, PAYMENT_REQUEST_MARKER);
}

export function paymentRequestNote(now: Date = new Date()): string {
  return stampNote(PAYMENT_REQUEST_MARKER, now);
}

export async function getAbandoned(eventSlug: string): Promise<AbandonedRow[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('vendor_applications')
      .select(
        'id, business_name, contact_name, phone, email, spot_type, amount_cents, created_at, admin_notes, square_payment_link_id'
      )
      .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
      .eq('event_slug', eventSlug)
      .eq('payment_status', 'unpaid')
      .not('square_order_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const now = Date.now();
    return (data ?? []).map((row) => ({
      ...row,
      minutesAgo: Math.max(0, Math.round((now - Date.parse(row.created_at)) / 60_000)),
      lastReminderAt: lastReminderFrom(row.admin_notes),
    })) as AbandonedRow[];
  } catch (err) {
    console.error('unpaid application query failed', err);
    return [];
  }
}

/** "2 hours ago", "45 minutes ago". */
export function howLongAgo(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Short local stamp for "last reminder" on a button. */
export function shortStamp(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Age out checkouts nobody finished.
 *
 * Square creates the order before the card is charged, so a vendor who picks a
 * spot and then closes the tab leaves a real row behind: unpaid, pending, with
 * a square_order_id and no square_payment_id. Five of those were sitting on the
 * September lot four days before the event. The homepage advertised two booths
 * left when five were free, and three of the five were the same vendors who had
 * come back and paid properly on a second attempt.
 *
 * A day is long enough that nobody who is genuinely coming back is caught by
 * this. lib/holds-spot stops these rows holding a spot after thirty minutes, so
 * the meter is right long before the row is touched; this is the tidying that
 * follows, and its job is to get them out of the tracker and out of the money.
 *
 * They become 'cancelled', not 'denied'. Denied is a decision somebody made and
 * it fires a refund. Cancelled is a vendor who walked away. Keeping the two
 * apart is what stops the denied list filling up with people who closed a tab,
 * and it is why the check constraint carries both.
 *
 * Runs when the tracker loads, and therefore also inside the production health
 * check, which signs in and loads the tracker as one of its steps. Not a cron:
 * a scheduled job that writes to the vendor table is a thing that can go wrong
 * at three in the morning with nobody watching, and there is no urgency here
 * that a page load does not satisfy.
 *
 * Never throws. A tracker that will not open because the tidying failed is a
 * worse outcome than a stale row.
 */
export const ABANDONED_MARKER = 'Checkout abandoned, cancelled automatically';

export async function ageOutAbandonedCheckouts(now: number = Date.now()): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const cutoff = new Date(now - ABANDON_AFTER_MS).toISOString();

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('vendor_applications')
      .select('id, admin_notes, created_at, payment_status, approval_status, square_order_id, square_payment_id')
      .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
      .eq('payment_status', 'unpaid')
      .eq('approval_status', 'pending')
      .not('square_order_id', 'is', null)
      .is('square_payment_id', null)
      .lt('created_at', cutoff);

    if (error) throw error;

    const rows = (data ?? []) as {
      id: string;
      admin_notes: string | null;
      created_at: string;
      payment_status: string;
      approval_status: string;
      square_order_id: string | null;
      square_payment_id: string | null;
    }[];

    let cancelled = 0;

    for (const row of rows) {
      /* The query above and isAbandonedCheckout say the same thing. Asking
         both is not redundant: the query is what makes this one round trip
         instead of a table scan, and the predicate is the definition. If they
         ever disagree the predicate wins and the row is left alone. */
      if (!isAbandonedCheckout(row, now)) continue;

      const note = [row.admin_notes, stampNote(ABANDONED_MARKER, new Date(now))]
        .filter(Boolean)
        .join(' · ');

      const { error: updateError } = await supabase
        .from('vendor_applications')
        .update({
          approval_status: 'cancelled',
          admin_notes: note,
          updated_at: new Date(now).toISOString(),
        })
        .eq('id', row.id)
        /* Re-asserted at write time so two tracker loads at once cannot both
           cancel the same row, and so a vendor who paid in the moment between
           the read and the write is not cancelled out from under their
           payment. */
        .eq('payment_status', 'unpaid')
        .eq('approval_status', 'pending');

      if (updateError) {
        console.error('could not cancel abandoned checkout', row.id, updateError);
        continue;
      }
      cancelled += 1;
    }

    return cancelled;
  } catch (err) {
    console.error('aging out abandoned checkouts failed', err);
    return 0;
  }
}
