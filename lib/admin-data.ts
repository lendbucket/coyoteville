import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { EVENTS } from './seo';

/** One row as the tracker needs it. */
export type AdminApplication = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  event_slug: string;
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
  spot_number: string | null;
  admin_notes: string | null;
  square_payment_link_id: string | null;
  created_at: string;
};

export type AdminFilters = {
  event: string;
  status: string;
  q: string;
};

export type AdminView = {
  available: boolean;
  rows: AdminApplication[];
  counts: { total: number; paid: number; unpaid: number };
};

const COLUMNS = [
  'id',
  'business_name',
  'contact_name',
  'phone',
  'email',
  'spot_type',
  'event_slug',
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

  return {
    event: EVENTS.some((e) => e.slug === event) ? event : EVENTS[0].slug,
    status: ['paid', 'unpaid', 'not_required', 'refunded', 'expired'].includes(status)
      ? status
      : '',
    q,
  };
}

/**
 * Applications for one event, filtered.
 *
 * The counts are for the whole event, not the filtered slice, so the totals at
 * the top of the page stay meaningful while you search.
 */
export async function getAdminView(filters: AdminFilters): Promise<AdminView> {
  if (!isSupabaseConfigured()) {
    return { available: false, rows: [], counts: { total: 0, paid: 0, unpaid: 0 } };
  }

  try {
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('vendor_applications')
      .select(COLUMNS)
      .eq('event_slug', filters.event)
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

    // Counts come from a separate unfiltered read of the same event.
    const { data: allRows, error: countError } = await supabase
      .from('vendor_applications')
      .select('payment_status')
      .eq('event_slug', filters.event);

    if (countError) throw countError;

    let paid = 0;
    let unpaid = 0;
    for (const row of allRows ?? []) {
      if (row.payment_status === 'paid' || row.payment_status === 'not_required') paid += 1;
      else if (row.payment_status === 'unpaid') unpaid += 1;
    }

    return {
      available: true,
      rows,
      counts: { total: (allRows ?? []).length, paid, unpaid },
    };
  } catch (err) {
    console.error('admin view failed', err);
    return { available: false, rows: [], counts: { total: 0, paid: 0, unpaid: 0 } };
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
