import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';

/**
 * Started but not paid.
 *
 * A row counts as abandoned when it is still unpaid, a Square order was
 * actually created for it, and it has been sitting long enough that the vendor
 * is not simply mid checkout. Thirty minutes is comfortably past a normal
 * card entry and short enough to still be worth a phone call on event week.
 */
export const ABANDONED_AFTER_MINUTES = 30;

export type AbandonedRow = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  created_at: string;
  admin_notes: string | null;
  /** Whole minutes since the form was submitted. */
  minutesAgo: number;
  /** True when a reminder has already been logged against this row. */
  reminderSent: boolean;
};

const REMINDER_MARKER = 'Reminder sent';

export function reminderAlreadySent(adminNotes: string | null): boolean {
  return Boolean(adminNotes && adminNotes.includes(REMINDER_MARKER));
}

export function reminderNote(now: Date = new Date()): string {
  return `${REMINDER_MARKER} ${now.toISOString()}`;
}

export async function getAbandoned(eventSlug: string): Promise<AbandonedRow[]> {
  if (!isSupabaseConfigured()) return [];

  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MINUTES * 60_000).toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('vendor_applications')
      .select('id, business_name, contact_name, phone, email, spot_type, created_at, admin_notes')
      .eq('event_slug', eventSlug)
      .eq('payment_status', 'unpaid')
      .not('square_order_id', 'is', null)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const now = Date.now();
    return (data ?? []).map((row) => ({
      ...row,
      minutesAgo: Math.max(0, Math.round((now - Date.parse(row.created_at)) / 60_000)),
      reminderSent: reminderAlreadySent(row.admin_notes),
    })) as AbandonedRow[];
  } catch (err) {
    console.error('abandoned checkout query failed', err);
    return [];
  }
}

/** "2 hours ago", "45 minutes ago". */
export function howLongAgo(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
