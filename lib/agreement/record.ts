import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from '../supabase';
import { EVENTS, PRICING } from '../seo';
import { formatDayLong, isDayKey } from '../booking';
import { DAY_SCOPE, MONTHLY_SCOPE } from '../admin-scope';

/**
 * One signed agreement, as the PDF needs it.
 *
 * Read straight from the row rather than from the tracker's view model, because
 * the tracker deliberately does not carry signer_ip or signer_user_agent: they
 * are of no use on a phone at the gate and every byte crossing to the client
 * costs something there. They are the whole point here.
 */
export type SignedAgreementRow = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  event_slug: string | null;
  booking_kind: string;
  booking_date: string | null;
  amount_cents: number;
  monthly_amount_cents: number | null;
  payment_status: string;
  payment_method: string | null;
  approval_status: string;
  spot_number: string | null;
  waiver_accepted: boolean;
  signature_name: string;
  signed_date: string | null;
  signed_at: string | null;
  agreement_version: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  created_at: string;
};

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
  'amount_cents',
  'monthly_amount_cents',
  'payment_status',
  'payment_method',
  'approval_status',
  'spot_number',
  'waiver_accepted',
  'signature_name',
  'signed_date',
  'signed_at',
  'agreement_version',
  'signer_ip',
  'signer_user_agent',
  'created_at',
].join(', ');

/** The column and value a tracker scope filters on. Mirrors lib/admin-data. */
function scopeFilter(scope: string): { column: string; value: string } {
  if (scope === DAY_SCOPE) return { column: 'booking_kind', value: 'day' };
  if (scope === MONTHLY_SCOPE) return { column: 'booking_kind', value: 'monthly' };
  return { column: 'event_slug', value: scope };
}

export async function getSignedAgreement(id: string): Promise<SignedAgreementRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as SignedAgreementRow;
}

/**
 * Every signed agreement in one scope, oldest first.
 *
 * Oldest first because a zip of these is an archive and an archive reads in the
 * order things happened. Unsigned rows are dropped rather than exported empty:
 * there is no agreement to produce for a row nobody signed.
 */
export async function getSignedAgreementsForScope(scope: string): Promise<SignedAgreementRow[]> {
  if (!isSupabaseConfigured()) return [];

  const filter = scopeFilter(scope);
  const { data, error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .select(COLUMNS)
    .eq(filter.column, filter.value)
    .eq('waiver_accepted', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return (data as unknown as SignedAgreementRow[]).filter((row) => Boolean(row.agreement_version));
}

/* ------------------------------------------------------------- formatting */

export function spotTypeLabel(spotType: string): string {
  if (spotType === 'truck') return PRICING.truck.label;
  if (spotType === 'booth') return PRICING.booth.label;
  if (spotType === 'free') return PRICING.free.label;
  return spotType;
}

/** "Tailgate Kickoff, Friday, August 28, 2026", a date, or the monthly plan. */
export function bookingLabel(row: SignedAgreementRow): string {
  if (row.booking_kind === 'monthly') return 'Permanent monthly spot, recurring';
  if (row.booking_kind === 'day') {
    return row.booking_date && isDayKey(row.booking_date)
      ? formatDayLong(row.booking_date)
      : 'Single day booking';
  }
  const event = EVENTS.find((e) => e.slug === row.event_slug);
  return event ? `${event.name}, ${event.displayDate}` : (row.event_slug ?? 'Event');
}

/** What the vendor actually paid, said the way the booking works. */
export function amountLabel(row: SignedAgreementRow): string {
  if (row.booking_kind === 'monthly') {
    const cents = row.monthly_amount_cents ?? row.amount_cents;
    return cents ? `$${(cents / 100).toFixed(2)} per month` : 'No charge';
  }
  return row.amount_cents ? `$${(row.amount_cents / 100).toFixed(2)}` : 'No charge';
}

export function paymentMethodLabel(row: SignedAgreementRow): string {
  const method =
    row.payment_method === 'offline'
      ? 'Paid offline, registered by staff'
      : row.payment_method === 'square'
        ? 'Square'
        : (row.payment_method ?? 'Not recorded');

  const status =
    row.payment_status === 'not_required'
      ? 'no charge'
      : row.payment_status === 'paid'
        ? 'paid'
        : row.payment_status;

  return `${method} (${status})`;
}

/**
 * The exact signing timestamp, with the offset spelled out.
 *
 * Both readings are printed: the wall clock in the park's timezone, which is
 * what anybody involved would recognise, and the stored UTC instant, which is
 * what the database actually holds. A record that gives only one of them
 * invites an argument about which it meant.
 */
export function signedAtLabel(signedAt: string | null): string {
  if (!signedAt) return 'Not recorded';

  const date = new Date(signedAt);
  if (Number.isNaN(date.getTime())) return signedAt;

  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date);

  return `${local} (${date.toISOString()} UTC)`;
}

/** "Friday, August 28, 2026" from the stored signing date. */
export function signedDateLabel(signedDate: string | null): string {
  if (!signedDate) return 'Not recorded';
  return isDayKey(signedDate) ? formatDayLong(signedDate) : signedDate;
}

/**
 * The download name: business first, then the signing date, so a folder of
 * these sorts by vendor and a vendor's own agreements sort by date within that.
 */
export function agreementFileName(row: SignedAgreementRow): string {
  const business =
    row.business_name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'vendor';

  const date = row.signed_date ?? row.signed_at?.slice(0, 10) ?? row.created_at.slice(0, 10);

  return `${business}-${date}-agreement.pdf`;
}
