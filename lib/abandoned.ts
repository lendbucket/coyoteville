import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';

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
 * Reminders are appended to admin_notes, so a row can carry several. The most
 * recent one is what the tracker shows.
 */
export function lastReminderFrom(adminNotes: string | null): string | null {
  if (!adminNotes) return null;

  const stamps = [...adminNotes.matchAll(new RegExp(`${REMINDER_MARKER} (\\S+)`, 'g'))]
    .map((m) => m[1])
    .filter((s) => !Number.isNaN(Date.parse(s)));

  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

export function reminderNote(now: Date = new Date()): string {
  return `${REMINDER_MARKER} ${now.toISOString()}`;
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
