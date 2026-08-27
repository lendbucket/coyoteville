import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';

/**
 * The waitlist.
 *
 * Where a vendor lands when an event is full or its signup deadline has gone.
 * Nothing in here is a spot: no agreement is signed, no payment is taken, and
 * a row only becomes a real vendor when someone is offered a place and
 * completes the normal form.
 *
 * Position is assigned by the join_waitlist function in the database rather
 * than here, so two people joining at the same instant cannot be handed the
 * same number. Positions are never renumbered, so a declined entry leaves a
 * gap; the queue is the order people joined, not a live ranking.
 */

export type WaitlistStatus = 'waiting' | 'offered' | 'converted' | 'declined';

export type WaitlistEntry = {
  id: string;
  event_slug: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  sells: string;
  position: number;
  status: WaitlistStatus;
  offered_at: string | null;
  converted_at: string | null;
  declined_at: string | null;
  admin_notes: string | null;
  created_at: string;
};

export type WaitlistJoin = {
  event_slug: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  sells: string;
};

const COLUMNS =
  'id, event_slug, business_name, contact_name, phone, email, spot_type, sells, position, status, offered_at, converted_at, declined_at, admin_notes, created_at';

/** Postgres unique violation. Someone is already on this event's list. */
function isDuplicate(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key value/i.test(error.message ?? '');
}

export type JoinResult =
  | { ok: true; entry: WaitlistEntry; alreadyOn: false }
  | { ok: true; entry: WaitlistEntry; alreadyOn: true }
  | { ok: false; error: string };

/**
 * Add someone to an event's waitlist.
 *
 * Submitting twice is treated as the same person, not as two places in the
 * queue: the unique index on (event_slug, lower(email)) catches it and their
 * existing row comes back instead, so the page can tell them where they
 * already stand rather than showing an error they cannot act on.
 */
export async function joinWaitlist(input: WaitlistJoin): Promise<JoinResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'The waitlist is not available right now.' };
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc('join_waitlist', { payload: input });

    if (error) {
      if (isDuplicate(error)) {
        const existing = await findByEmail(input.event_slug, input.email);
        if (existing) return { ok: true, entry: existing, alreadyOn: true };
      }
      throw error;
    }

    // The function returns the row as a composite, which PostgREST hands back
    // either bare or wrapped in a single element array depending on version.
    const entry = (Array.isArray(data) ? data[0] : data) as WaitlistEntry | null;
    if (!entry) throw new Error('join_waitlist returned no row');

    return { ok: true, entry, alreadyOn: false };
  } catch (err) {
    console.error('waitlist join failed', err);
    return { ok: false, error: 'We could not add you to the waitlist. Try again in a minute.' };
  }
}

export async function findByEmail(
  eventSlug: string,
  email: string
): Promise<WaitlistEntry | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('waitlist')
    .select(COLUMNS)
    .eq('event_slug', eventSlug)
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    console.error('waitlist lookup failed', error);
    return null;
  }

  return (data as unknown as WaitlistEntry) ?? null;
}

export async function getWaitlist(eventSlug: string): Promise<WaitlistEntry[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('waitlist')
      .select(COLUMNS)
      .eq('event_slug', eventSlug)
      .order('position', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as WaitlistEntry[];
  } catch (err) {
    console.error('waitlist read failed', err);
    return [];
  }
}

export async function getEntry(id: string): Promise<WaitlistEntry | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('waitlist')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('waitlist entry read failed', error);
    return null;
  }

  return (data as unknown as WaitlistEntry) ?? null;
}

/**
 * Mark someone offered, stamping the moment the invitation went out.
 *
 * Only called after the email is accepted by the provider, so the timestamp
 * means "we actually told them", not "we tried to".
 */
export async function markOffered(id: string, at: Date = new Date()): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('waitlist')
      .update({ status: 'offered', offered_at: at.toISOString() })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('waitlist offer stamp failed', err);
    return false;
  }
}

/** How many are still waiting on an event, for the admin header. */
export function countWaiting(entries: WaitlistEntry[]): number {
  return entries.filter((e) => e.status === 'waiting').length;
}
