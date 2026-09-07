import 'server-only';
import { HEALTHCHECK_BUSINESS_NAME } from './healthcheck';
import { loadVendorHistory, type VendorHistoryMap } from './vendor-history';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { getEvents, getNextEvent } from './events-source';
import { getSpotsFresh } from './spots';
import { isSettled } from './holds-spot';
import { ageOutAbandonedCheckouts } from './abandoned';
import { summariseRevenue, type RevenueRow, type RevenueSummary } from './revenue';
import { ALL_SCOPE, DAY_SCOPE, MONTHLY_SCOPE, isEventScope } from './admin-scope';
import { RELEASING_STATUSES } from './approval';

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
  /** timestamptz. Converted to a day key at the point it is read. */
  subscription_next_billing_at: string | null;
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
  /** Cash counted by hand against an offline row. Null means unreconciled. */
  amount_received_cents: number | null;
  /**
   * When that cash was counted. Not paid_at, which the database stamps at
   * submission and which therefore says nothing about money arriving.
   */
  amount_received_at: string | null;
  payment_status: string;
  payment_method: string | null;
  approval_status: string;
  reviewed_at: string | null;
  denial_reason: string | null;
  refund_amount_cents: number | null;
  refund_error: string | null;
  spot_number: string | null;
  admin_notes: string | null;
  /** The profile this application belongs to. Null for an anonymous one. */
  vendor_id: string | null;
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
  counts: {
    total: number;
    paid: number;
    /**
     * Rows that owe money right now: unpaid, not a permanent monthly spot, and
     * carrying a fee. The count the "Unpaid" chip shows and the same rule
     * owesPayment() uses on the client, so the chip's number is always the
     * length of the list tapping it opens.
     */
    unpaid: number;
    pending: number;
    /**
     * Rows in the scope carrying a signed agreement. Counted off the unfiltered
     * read rather than the visible list, because the bulk agreement download
     * archives the whole scope: a number that moved with the search box would
     * promise a different archive than the one the button produces.
     */
    signed: number;
    /**
     * Settled offline rows with no cash recorded against them. The count the
     * "Cash owed" chip shows, taken off the unfiltered read so it does not move
     * with the search box.
     */
    unreconciled: number;
    /**
     * The same two jobs, counted across every scope rather than this one.
     *
     * These are the numbers the chips carry. A chip that counts only the scope
     * you happen to have open is how a day booking sat unpaid and unnoticed for
     * a week: no figure on the page included her, so there was nothing to
     * notice. Tapping a chip whose everywhere number is larger than its scoped
     * one takes you to the Everything scope, so the count and the list you land
     * on still agree.
     */
    unpaidEverywhere: number;
    pendingEverywhere: number;
  };
  /**
   * How many times each vendor on this page has applied, and what for.
   *
   * Keyed by vendor_id, loaded in one query for the whole page rather than one
   * per row: the tracker polls every thirty seconds and a per row lookup across
   * forty six applications would be a lot of round trips to answer a question
   * that is one group by. Empty when nothing on the page has a profile.
   */
  history: VendorHistoryMap;
  /** Event wide, never the filtered slice. Null when the read failed. */
  revenue: RevenueSummary | null;
  /**
   * How much more the queue will take before signup shuts and sends people to
   * the waitlist, per spot type.
   *
   * Null under the day and monthly scopes, where the number is per date rather
   * than per event and belongs on the calendar instead. Also null when no
   * capacity is set, because there is then nothing to cap against.
   */
  reviewSlots: ReviewSlots | null;
};

export type ReviewSlots = {
  booth: ReviewSlotLine;
  truck: ReviewSlotLine;
};

export type ReviewSlotLine = {
  /** Applications of this type still accepted before signup shuts. */
  remaining: number;
  /**
   * Spots that exist: the plain booth_capacity or truck_capacity column.
   *
   * Not capacity plus the review buffer, which is what this used to carry. The
   * buffer is how far past capacity applications keep being taken so there is
   * something to choose between; printing it as the denominator told the admin
   * a twenty two booth lot had twenty seven booths.
   */
  capacity: number;
  /** Rows of this type not denied, plus any permanent monthly vendors. */
  held: number;
};

const EMPTY_COUNTS = {
  total: 0,
  paid: 0,
  unpaid: 0,
  pending: 0,
  signed: 0,
  unreconciled: 0,
  unpaidEverywhere: 0,
  pendingEverywhere: 0,
};

/**
 * Unpaid and waiting-on-review, across every scope at once.
 *
 * The two chips that are a job rather than a view have to count everything or
 * they lie by omission. A vendor part way through a single day booking owes
 * money whichever event you happen to have selected, and the whole reason she
 * went unnoticed for a week is that no number on the page included her.
 *
 * The same two rules the per scope counts use, so a chip and the list it opens
 * agree: owed means unpaid, not monthly, and carrying a fee; review means a
 * pending decision on a row whose money has settled, or any monthly row, whose
 * card is held and unpaid by design.
 */
async function countEverywhere(): Promise<{ unpaid: number; pending: number }> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('vendor_applications')
      .select('payment_status, approval_status, booking_kind, amount_cents')
      .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
      .not('approval_status', 'in', `(${RELEASING_STATUSES.join(',')})`);

    if (error) throw error;

    let unpaid = 0;
    let pending = 0;

    for (const row of (data ?? []) as unknown as {
      payment_status: string;
      approval_status: string;
      booking_kind: string | null;
      amount_cents: number | null;
    }[]) {
      const settled = isSettled(row.payment_status);

      if (
        !settled &&
        row.payment_status === 'unpaid' &&
        row.booking_kind !== 'monthly' &&
        Number(row.amount_cents ?? 0) > 0
      ) {
        unpaid += 1;
      }

      if ((settled || row.booking_kind === 'monthly') && row.approval_status === 'pending') {
        pending += 1;
      }
    }

    return { unpaid, pending };
  } catch (err) {
    /* Zero would quietly hide the very rows this exists to surface, so a read
       failure falls back to the per scope numbers at the call site. */
    console.error('cross scope counts failed', err);
    return { unpaid: -1, pending: -1 };
  }
}

/** Columns the revenue summary reads, on top of the ones the tracker shows. */
const REVENUE_COLUMNS =
  'business_name, spot_type, amount_cents, amount_received_cents, payment_status, payment_method, approval_status, square_order_id, square_payment_id, created_at, booking_kind, waiver_accepted, agreement_version';

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
  'subscription_next_billing_at',
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
  'amount_received_cents',
  'amount_received_at',
  'payment_status',
  'payment_method',
  'approval_status',
  'reviewed_at',
  'denial_reason',
  'refund_amount_cents',
  'refund_error',
  'spot_number',
  'admin_notes',
  'vendor_id',
  'square_payment_link_id',
  'created_at',
].join(', ');

/**
 * What the tracker opens on when the URL says nothing.
 *
 * The soonest event that has not finished, resolved against the clock on every
 * request. It used to be EVENTS[0], the first entry in the static calendar,
 * which never advances: the day after an event the tracker still opened on it,
 * and applications for the next one were invisible until somebody thought to
 * change the dropdown. Two paid vendors sat unseen in the review queue that
 * way.
 *
 * An explicit ?event= is still honoured whatever its state, including a
 * finished one. The admin has to be able to go back and look at August after
 * August is over; what it must not do is land there on its own.
 */
async function defaultEventSlug(now: number = Date.now()): Promise<string> {
  return (await getNextEvent(now))?.slug ?? '';
}

/** The two arguments normaliseFilters needs, read from the events table. */
export async function filterContext(now: number = Date.now()): Promise<{
  knownSlugs: string[];
  fallback: string;
}> {
  const events = await getEvents();
  return { knownSlugs: events.map((e) => e.slug), fallback: await defaultEventSlug(now) };
}

export function normaliseFilters(
  params: Record<string, string | string[] | undefined>,
  /** Slugs the events table knows about. Passed in so this stays sync. */
  knownSlugs: readonly string[],
  fallback: string
): AdminFilters {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };

  const event = one('event') || fallback;
  const status = one('status');
  const q = one('q').slice(0, 80);

  const known =
    !isEventScope(event) || knownSlugs.includes(event);

  return {
    event: known ? event : fallback,
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
function scopeFilter(scope: string): { column: string; value: string } | null {
  // Everything: no column narrows it. The caller drops the .eq() entirely
  // rather than passing a filter that matches all rows, because there is no
  // such filter to pass.
  if (scope === ALL_SCOPE) return null;
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
    return {
      available: false,
      rows: [],
      counts: { ...EMPTY_COUNTS },
      history: {},
      revenue: null,
      reviewSlots: null,
    };
  }

  /* Tidy before reading, so the page cannot render a row this pass is about to
     cancel. Awaited rather than fired and forgotten: an unawaited write on a
     serverless function is a write that may never happen, the instance having
     been frozen the moment the response went out. It is one indexed query on
     the common path where nothing needs cancelling. */
  await ageOutAbandonedCheckouts();

  try {
    const supabase = getSupabaseAdmin();

    const scope = scopeFilter(filters.event);

    let query = supabase
      .from('vendor_applications')
      .select(COLUMNS)
      /* The production health check writes real rows through the real route,
         because the insert is what broke. They must never reach the tracker. */
      .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
      .order('created_at', { ascending: false });

    if (scope) query = query.eq(scope.column, scope.value);
    /* Everything live, not everything ever. A denied vendor and an aged out
       checkout are both settled questions, and a list of every row this park
       has ever seen is not a tracker. They stay reachable under their own
       event. */
    else query = query.not('approval_status', 'in', `(${RELEASING_STATUSES.join(',')})`);

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
    const [countResult, spots, everywhere] = await Promise.all([
      (() => {
        let counted = supabase
          .from('vendor_applications')
          .select(REVENUE_COLUMNS)
          .neq('business_name', HEALTHCHECK_BUSINESS_NAME);
        if (scope) counted = counted.eq(scope.column, scope.value);
        else
          counted = counted.not(
            'approval_status',
            'in',
            `(${RELEASING_STATUSES.join(',')})`
          );
        return counted;
      })(),
      /* Capacity only means something for an event scope. The day and monthly
         views are not measured against one event's booth and truck numbers, so
         they read the next event's snapshot purely to keep the projection
         helper fed, and simply do not show the meter. */
      getSpotsFresh(
        isEventScope(filters.event) ? filters.event : ((await getNextEvent())?.slug ?? '')
      ),
      countEverywhere(),
    ]);

    if (countResult.error) throw countResult.error;

    const allRows = (countResult.data ?? []) as unknown as (RevenueRow & {
      waiver_accepted: boolean;
      agreement_version: string | null;
    })[];

    let paid = 0;
    let unpaid = 0;
    let pending = 0;
    let signed = 0;
    let unreconciled = 0;
    for (const row of allRows) {
      // What the bulk agreement download will actually find: signed, and
      // stamped with the version it was signed under.
      if (row.waiver_accepted && row.agreement_version) signed += 1;

      const settled = isSettled(row.payment_status);

      /* Claims paid, with nothing counted against it. The database stamps a
         prepaid row paid the moment the vendor submits, so this is the only
         thing separating money that exists from money that is asserted. */
      if (
        settled &&
        row.payment_method === 'offline' &&
        (row.amount_received_cents === null || row.amount_received_cents === undefined)
      ) {
        unreconciled += 1;
      }

      /* Owes money right now. Deliberately narrower than "payment_status is
         unpaid": a permanent monthly row is meant to be unpaid before approval,
         because its card is held and approving it is what takes the first
         charge, and a row with no fee has nothing to collect. This is the
         number the Unpaid chip carries, so it has to be the same rule
         owesPayment() in components/admin/types uses on the client. A count
         that does not match the length of the list it opens is worse than no
         count. */
      if (settled) paid += 1;
      else if (
        row.payment_status === 'unpaid' &&
        row.booking_kind !== 'monthly' &&
        Number(row.amount_cents ?? 0) > 0
      ) {
        unpaid += 1;
      }

      /* Waiting on a decision. For a one-off booking that means the money is
         in: an abandoned checkout is a lead, not a queue item. A monthly
         application is different and is counted while unpaid, because it is
         supposed to be unpaid at this stage. Its card is authorised and held,
         and approving it is what takes the first charge. */
      const readyForReview = settled || row.booking_kind === 'monthly';
      if (readyForReview && row.approval_status === 'pending') pending += 1;
    }

    /* One query for every vendor on this page, whatever the scope or the
       search. Rows without a vendor_id are anonymous applications and have no
       history to load. */
    const history = await loadVendorHistory(
      rows.map((r) => r.vendor_id).filter((id): id is string => Boolean(id))
    );

    return {
      available: true,
      rows,
      history,
      counts: {
        total: allRows.length,
        paid,
        unpaid,
        pending,
        signed,
        unreconciled,
        /* A failed cross scope read comes back as -1 rather than 0, and falls
           back to the scoped number here. Showing a smaller count than the
           truth is the bug being fixed; showing the scoped one is where the
           page already was. */
        unpaidEverywhere: everywhere.unpaid < 0 ? unpaid : everywhere.unpaid,
        pendingEverywhere: everywhere.pending < 0 ? pending : everywhere.pending,
      },
      revenue: summariseRevenue(allRows, {
        truck: spots.truck.capacity,
        booth: spots.booth.capacity,
      }),
      reviewSlots:
        isEventScope(filters.event) &&
        spots.booth.capacity !== null &&
        spots.truck.capacity !== null
          ? {
              booth: {
                remaining: spots.booth.reviewRemaining ?? 0,
                capacity: spots.booth.capacity,
                held: spots.booth.held,
              },
              truck: {
                remaining: spots.truck.reviewRemaining ?? 0,
                capacity: spots.truck.capacity,
                held: spots.truck.held,
              },
            }
          : null,
    };
  } catch (err) {
    console.error('admin view failed', err);
    return {
      available: false,
      rows: [],
      counts: { ...EMPTY_COUNTS },
      history: {},
      revenue: null,
      reviewSlots: null,
    };
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
