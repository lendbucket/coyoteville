import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from '../supabase';
import { getEvents } from '../events-source';

/**
 * The organization's signed program terms, as a record.
 *
 * The same job lib/agreement/record does for a vendor: read the row, label its
 * fields for print, and name the file. Nothing here decides which text to
 * render. That comes off terms_version through the registry, so a PDF can only
 * ever be the version the organization actually signed.
 */

export type SignedOrgRow = {
  id: string;
  org_name: string;
  org_type: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  ein: string | null;
  is_501c3: boolean | null;
  volunteer_count: number | null;
  event_slugs: string[] | null;
  status: string | null;
  terms_accepted: boolean | null;
  terms_version: string | null;
  signature_name: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  created_at: string;
};

const COLUMNS =
  'id, org_name, org_type, contact_name, email, phone, ein, is_501c3, volunteer_count, ' +
  'event_slugs, status, terms_accepted, terms_version, signature_name, signed_at, ' +
  'signer_ip, signer_user_agent, created_at';

export async function getSignedOrgTerms(id: string): Promise<SignedOrgRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('org_applications')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as SignedOrgRow;
}

/**
 * Every organization that signed, oldest first.
 *
 * Unsigned rows are dropped rather than exported blank: there is no document to
 * produce for a row nobody signed. Withdrawn and declined organizations stay
 * in, because they signed and the archive is a record of what was agreed, not
 * a list of who is currently working a game.
 */
export async function getAllSignedOrgTerms(): Promise<SignedOrgRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from('org_applications')
    .select(COLUMNS)
    .eq('terms_accepted', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return (data as unknown as SignedOrgRow[]).filter(
    (row) => Boolean(row.signature_name) && Boolean(row.terms_version)
  );
}

/** The games the organization put itself forward for, named rather than slugged. */
export async function gameNames(row: SignedOrgRow): Promise<string[]> {
  const slugs = row.event_slugs ?? [];
  if (!slugs.length) return [];

  const events = await getEvents();
  return slugs.map((slug) => {
    const event = events.find((e) => e.slug === slug);
    return event ? `${event.name}, ${event.displayDate}` : slug;
  });
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

export function volunteerLabel(row: SignedOrgRow): string {
  const n = row.volunteer_count;
  if (!n) return 'Not stated';
  return `${n} ${n === 1 ? 'adult' : 'adults'}`;
}

export function statusLabel(row: SignedOrgRow): string {
  switch (row.status) {
    case 'selected':
      return 'Selected for a game';
    case 'declined':
      return 'Not selected';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return 'Applied, awaiting a draw';
  }
}

/** A filename somebody can find a year later without opening it. */
export function orgTermsFileName(row: SignedOrgRow): string {
  const name = row.org_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const day = (row.signed_at ?? row.created_at).slice(0, 10);
  return `coyoteville-program-terms-${name || 'organization'}-${day}.pdf`;
}
