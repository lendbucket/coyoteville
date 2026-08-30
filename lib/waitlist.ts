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
  /** Null for a day entry, which is not an event and has no slug. */
  event_slug: string | null;
  booking_date: string | null;
  booking_kind: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  sells: string;
  position: number;
  /**
   * Where the entry stands, and the only record that it moved.
   *
   * The table has no converted_at and no declined_at; `offered_at` is the one
   * timestamp it keeps. A converted or declined entry is one whose status says
   * so, which is how every check in the app already read it. See SCHEMA.md.
   */
  status: WaitlistStatus;
  offered_at: string | null;
  admin_notes: string | null;
  created_at: string;
};

export type WaitlistJoin = {
  /** An event slug, or null for a day. Exactly one of these two is set. */
  event_slug: string | null;
  booking_date: string | null;
  booking_kind: 'event' | 'day';
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  sells: string;
};

const COLUMNS =
  'id, event_slug, booking_date, booking_kind, business_name, contact_name, phone, email, spot_type, sells, position, status, offered_at, admin_notes, created_at';

/**
 * Whether this entry came off the list and registered.
 *
 * Conversion is read off `status`, not off a timestamp: the table has no
 * converted_at column. Every check in the app already worked this way; the
 * select was simply asking for a column that does not exist alongside them.
 */
export function isConverted(entry: WaitlistEntry): boolean {
  return entry.status === 'converted';
}

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
        const existing = await findByEmail(input.event_slug, input.booking_date, input.email);
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
  eventSlug: string | null,
  bookingDate: string | null,
  email: string
): Promise<WaitlistEntry | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  /* Scoped the same way the unique index is, so the row that comes back is the
     one that actually collided rather than the same person on another date. */
  const base = supabase.from('waitlist').select(COLUMNS).ilike('email', email);

  const { data, error } = await (eventSlug
    ? base.eq('event_slug', eventSlug)
    : base.eq('booking_date', bookingDate)
  ).maybeSingle();

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

/** Everyone waiting on an ordinary day, soonest date first. */
export async function getDayWaitlist(): Promise<WaitlistEntry[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('waitlist')
      .select(COLUMNS)
      .eq('booking_kind', 'day')
      .order('booking_date', { ascending: true })
      .order('position', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as WaitlistEntry[];
  } catch (err) {
    console.error('day waitlist read failed', err);
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
