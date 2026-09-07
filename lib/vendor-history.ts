import 'server-only';
import { getSupabaseAdmin } from './supabase';
import { HEALTHCHECK_BUSINESS_NAME } from './healthcheck';
/* The approval status that hands a spot back. Kept in step with the constant
   of the same name in lib/spots, which is module private there. */
const DENIED = 'denied';

/**
 * How many times each vendor on this page has applied, and what for.
 *
 * Two queries for the whole page, not two per row. The tracker polls every
 * thirty seconds; a per row lookup across forty six applications would be
 * ninety two round trips a minute to answer a question that is one group by.
 *
 * Nothing is stored. The ordinal on a row is derived from a count at read time,
 * because a counter column would be a second copy of a fact the applications
 * already hold, and the two would disagree the first time a row was deleted.
 */

/** One of a vendor's applications, as the sheet lists them. */
export type VendorHistoryEntry = {
  id: string;
  eventSlug: string | null;
  bookingKind: string;
  bookingDate: string | null;
  spotType: string;
  paymentStatus: string;
  approvalStatus: string;
  createdAt: string;
};

export type VendorHistory = {
  /** Applications that count towards the ordinal, most recent first. */
  entries: VendorHistoryEntry[];
  /** Whether somebody has actually signed in and claimed the profile. */
  claimed: boolean;
};

/** id -> history, for every vendor_id present on the page. */
export type VendorHistoryMap = Record<string, VendorHistory>;

const HISTORY_COLUMNS =
  'id, vendor_id, event_slug, booking_kind, booking_date, spot_type, ' +
  'payment_status, approval_status, created_at';

export async function loadVendorHistory(vendorIds: string[]): Promise<VendorHistoryMap> {
  const ids = [...new Set(vendorIds.filter(Boolean))];
  if (!ids.length) return {};

  const supabase = getSupabaseAdmin();

  /* One query for every application belonging to any vendor on this page,
     across every event, because the ordinal is a lifetime count rather than a
     per event one.

     Denied rows are left out on purpose: an application that was refused is not
     an event this vendor worked, and counting it would tell Robert somebody is
     on their third event when they have set up twice. Health check rows are
     excluded for the same reason they are excluded everywhere. */
  const [applications, profiles] = await Promise.all([
    supabase
      .from('vendor_applications')
      .select(HISTORY_COLUMNS)
      .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
      .neq('approval_status', DENIED)
      .in('vendor_id', ids)
      .order('created_at', { ascending: false }),
    supabase.from('vendors').select('id, auth_user_id').in('id', ids),
  ]);

  if (applications.error) throw applications.error;

  const claimedById = new Map<string, boolean>();
  for (const row of (profiles.data ?? []) as { id: string; auth_user_id: string | null }[]) {
    claimedById.set(row.id, Boolean(row.auth_user_id));
  }

  const out: VendorHistoryMap = {};

  for (const row of (applications.data ?? []) as unknown as (VendorHistoryEntry & {
    vendor_id: string;
    event_slug: string | null;
    booking_kind: string;
    booking_date: string | null;
    spot_type: string;
    payment_status: string;
    approval_status: string;
    created_at: string;
  })[]) {
    const key = row.vendor_id;
    if (!out[key]) out[key] = { entries: [], claimed: claimedById.get(key) ?? false };
    out[key].entries.push({
      id: row.id,
      eventSlug: row.event_slug,
      bookingKind: row.booking_kind,
      bookingDate: row.booking_date,
      spotType: row.spot_type,
      paymentStatus: row.payment_status,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
    });
  }

  return out;
}

/**
 * Which number this application is in that vendor's run, oldest first.
 *
 * 1 for a first timer, 3 for MuddyWaterz's third truck. Returns 0 when the row
 * has no profile or is not in the history, which is every anonymous
 * application and is not a returning vendor by definition.
 */
export function ordinalFor(history: VendorHistory | undefined, applicationId: string): number {
  if (!history) return 0;
  // entries are newest first, so the oldest is the last.
  const index = history.entries.findIndex((e) => e.id === applicationId);
  if (index === -1) return 0;
  return history.entries.length - index;
}

/** "1st", "2nd", "3rd", "4th". */
export function ordinalLabel(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  if (ones === 1) return `${n}st`;
  if (ones === 2) return `${n}nd`;
  if (ones === 3) return `${n}rd`;
  return `${n}th`;
}
