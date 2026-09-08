import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from '../supabase';
import { getEvents } from '../events-source';

/**
 * A signed volunteer waiver, as a record.
 *
 * Reads the row and labels it for print. Which text to render is never decided
 * here: it comes off waiver_version through lib/volunteer-waiver/registry, so a
 * PDF can only be the version that volunteer saw on their phone.
 */

export type SignedWaiverRow = {
  id: string;
  event_slug: string;
  org_application_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  is_adult: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_signature_name: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  waiver_version: string;
  signature_name: string;
  signed_at: string;
  signer_ip: string | null;
  signer_user_agent: string | null;
  created_at: string;
};

const COLUMNS =
  'id, event_slug, org_application_id, full_name, phone, email, date_of_birth, is_adult, ' +
  'guardian_name, guardian_phone, guardian_signature_name, emergency_contact_name, ' +
  'emergency_contact_phone, waiver_version, signature_name, signed_at, signer_ip, ' +
  'signer_user_agent, created_at';

export async function getSignedWaiver(id: string): Promise<SignedWaiverRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('volunteer_waivers')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as SignedWaiverRow;
}

/** Every waiver signed for one game, in the order they were signed. */
export async function getSignedWaiversForEvent(eventSlug: string): Promise<SignedWaiverRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from('volunteer_waivers')
    .select(COLUMNS)
    .eq('event_slug', eventSlug)
    .order('signed_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as SignedWaiverRow[];
}

/** The organization each waiver was signed under, in one query for the batch. */
export async function orgNamesFor(
  rows: readonly SignedWaiverRow[]
): Promise<Record<string, string>> {
  const ids = [...new Set(rows.map((r) => r.org_application_id).filter(Boolean))] as string[];
  if (!ids.length || !isSupabaseConfigured()) return {};

  try {
    const { data } = await getSupabaseAdmin()
      .from('org_applications')
      .select('id, org_name')
      .in('id', ids);

    const out: Record<string, string> = {};
    for (const o of (data ?? []) as { id: string; org_name: string }[]) out[o.id] = o.org_name;
    return out;
  } catch (err) {
    /* A name is a nicety on this document. Its absence must not stop a waiver
       being produced, because the waiver is the thing with legal weight. */
    console.error('could not read organization names for waivers', err);
    return {};
  }
}

export async function eventLabel(slug: string): Promise<string> {
  const event = (await getEvents()).find((e) => e.slug === slug);
  return event ? `${event.name}, ${event.displayDate}` : slug;
}

export function signedAtLabel(value: string | null): string {
  if (!value) return 'Not recorded';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(at);
}

/**
 * Date of birth, printed as the date it is.
 *
 * Split by hand rather than put through a Date, which would shift a birthday
 * across a timezone boundary and print somebody a day younger than they are.
 */
export function birthDateLabel(value: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return 'Not recorded';

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** A filename that says who, which night, and whether a guardian signed. */
export function waiverFileName(row: SignedWaiverRow): string {
  const name = row.full_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const day = (row.signed_at ?? row.created_at).slice(0, 10);
  const minor = row.is_adult ? '' : '-minor';
  return `coyoteville-volunteer-waiver-${name || 'volunteer'}${minor}-${day}.pdf`;
}
