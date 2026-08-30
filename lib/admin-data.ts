import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { EVENTS } from './seo';
import { getSpots } from './spots';
import { summariseRevenue, type RevenueRow, type RevenueSummary } from './revenue';
import { DAY_SCOPE, MONTHLY_SCOPE, isEventScope } from './admin-scope';

/** One row as the tracker needs it. */
export type AdminApplication = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  event_slug: string | null;
  booking_kind: string;
  booking_date: string | null;
  square_subscription_id: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  monthly_amount_cents: number | null;
  failed_payment_count: number;
  sells: string;
  notes: string | null;
  serves_food: boolean;
  waiver_accepted: boolean;
  signature_name: string;
  signed_at: string | null;
  signed_date: string | null;
  agreement_version: string | null;
  logo_path: string | null;
  photo_paths: string[] | null;
  permit_path: string | null;
  upload_issues: string | null;
  amount_cents: number;
  payment_status: string;
  payment_method: string | null;
  approval_status: string;
  reviewed_at: string | null;
  denial_reason: string | null;
  refund_amount_cents: number | null;
  refund_error: string | null;
  spot_number: string | null;
  admin_notes: string | null;
  square_payment_link_id: string | null;
  created_at: string;
};

export type AdminFilters = {
  /**
   * What the tracker is scoped to. An event slug, or one of the two pseudo
   * scopes for the bookings that are not tied to an event at all.
   *
   * Kept in the same URL parameter the event picker already used, because it is
   * the same question from the person using it: which set of vendors am I
   * looking at.
   */
  event: string;
  status: string;
  q: string;
};

export type AdminView = {
  available: boolean;
  rows: AdminApplication[];
  /**
   * `pending` is settled applications waiting on a decision, which is the one
   * number on this page that is a job rather than a fact. Unpaid rows are not
   * in it: nobody is waiting on the admin until the money has landed.
   */
  counts: { total: number; paid: number; unpaid: number; pending: number };
  /** Event wide, never the filtered slice. Null when the read failed. */
  revenue: RevenueSummary | null;
};

const EMPTY_COUNTS = { total: 0, paid: 0, unpaid: 0, pending: 0 };

/** Columns the revenue summary reads, on top of the ones the tracker shows. */
const REVENUE_COLUMNS =
  'spot_type, amount_cents, payment_status, payment_method, approval_status, square_order_id, created_at, booking_kind';

const COLUMNS = [
  'id',
  'business_name',
  'contact_name',
  'phone',
  'email',
  'spot_type',
  'event_slug',
  'booking_kind',
  'booking_date',
  'square_subscription_id',
  'subscription_status',
  'subscription_period_end',
  'subscription_cancel_at_period_end',
  'monthly_amount_cents',
  'failed_payment_count',
  'sells',
  'notes',
  'serves_food',
  'waiver_accepted',
  'signature_name',
  'signed_at',
  'signed_date',
  'agreement_version',
  'logo_path',
  'photo_paths',
  'permit_path',
  'upload_issues',
  'amount_cents',
  'payment_status',
  'payment_method',
  'approval_status',
  'reviewed_at',
  'denial_reason',
  'refund_amount_cents',
  'refund_error',
  'spot_number',
  'admin_notes',
  'square_payment_link_id',
  'created_at',
].join(', ');

export function normaliseFilters(params: Record<string, string | string[] | undefined>): AdminFilters {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };

  const event = one('event') || EVENTS[0].slug;
  const status = one('status');
  const q = one('q').slice(0, 80);

  const known =
    event === DAY_SCOPE || event === MONTHLY_SCOPE || EVENTS.some((e) => e.slug === event);

  return {
    event: known ? event : EVENTS[0].slug,
    status: ['paid', 'unpaid', 'not_required', 'refunded', 'expired'].includes(status)
      ? status
      : '',
    q,
  };
}

/**
 * The column and value a scope filters on.
 *
 * Returned as a pair rather than applied through a generic helper: the Supabase
 * query builder's types are recursive enough that threading them through a
 * generic wrapper blows the instantiation depth limit, and a pair of strings
 * says the same thing with none of that.
 */
function scopeFilter(scope: string): { column: string; value: string } {
  if (scope === DAY_SCOPE) return { column: 'booking_kind', value: 'day' };
  if (scope === MONTHLY_SCOPE) return { column: 'booking_kind', value: 'monthly' };
  return { column: 'event_slug', value: scope };
}

/**
 * Applications for one event, filtered.
 *
 * The counts are for the whole event, not the filtered slice, so the totals at
 * the top of the page stay meaningful while you search.
 */
export async function getAdminView(filters: AdminFilters): Promise<AdminView> {
  if (!isSupabaseConfigured()) {
    return { available: false, rows: [], counts: { ...EMPTY_COUNTS }, revenue: null };
  }

  try {
    const supabase = getSupabaseAdmin();

    const scope = scopeFilter(filters.event);

    let query = supabase
      .from('vendor_applications')
      .select(COLUMNS)
      .eq(scope.column, scope.value)
      .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('payment_status', filters.status);

    // Escape the PostgREST pattern wildcards so a search for "%" is literal.
    if (filters.q) {
      const safe = filters.q.replace(/[%_,()]/g, '');
      if (safe) query = query.ilike('business_name', `%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as AdminApplication[];

    // Counts and money come from a separate unfiltered read of the same event,
    // so the figures at the top of the page stay meaningful while you search.
    // Capacity for the projection rides along from the cached spot snapshot.
    const [countResult, spots] = await Promise.all([
      supabase
        .from('vendor_applications')
        .select(REVENUE_COLUMNS)
        .eq(scope.column, scope.value),
      /* Capacity only means something for an event scope. The day and monthly
         views are not measured against one event's booth and truck numbers, so
         they read the next event's snapshot purely to keep the projection
         helper fed, and simply do not show the meter. */
      getSpots(isEventScope(filters.event) ? filters.event : EVENTS[0].slug),
    ]);

    if (countResult.error) throw countResult.error;

    const allRows = (countResult.data ?? []) as unknown as RevenueRow[];

    let paid = 0;
    let unpaid = 0;
    let pending = 0;
    for (const row of allRows) {
      const settled = row.payment_status === 'paid' || row.payment_status === 'not_required';
      if (settled) paid += 1;
      else if (row.payment_status === 'unpaid') unpaid += 1;

      /* Waiting on a decision. For a one-off booking that means the money is
         in: an abandoned checkout is a lead, not a queue item. A monthly
         application is different and is counted while unpaid, because it is
         supposed to be unpaid at this stage. Its card is authorised and held,
         and approving it is what takes the first charge. */
      const readyForReview = settled || row.booking_kind === 'monthly';
      if (readyForReview && row.approval_status === 'pending') pending += 1;
    }

    return {
      available: true,
      rows,
      counts: { total: allRows.length, paid, unpaid, pending },
      revenue: summariseRevenue(allRows, {
        truck: spots.truck.capacity,
        booth: spots.booth.capacity,
      }),
    };
  } catch (err) {
    console.error('admin view failed', err);
    return { available: false, rows: [], counts: { ...EMPTY_COUNTS }, revenue: null };
  }
}

/** Look up one row's stored path for a given upload slot. */
export async function getUploadPath(
  id: string,
  kind: 'logo' | 'permit' | 'photo',
  index = 0
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('vendor_applications')
    .select('logo_path, permit_path, photo_paths')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  if (kind === 'logo') return data.logo_path ?? null;
  if (kind === 'permit') return data.permit_path ?? null;
  return data.photo_paths?.[index] ?? null;
}
