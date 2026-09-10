import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSquare, getSquareLocationId, isSquareConfigured } from './square';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { getEvents, endsAtMs } from './events-source';
import { PARKING_PRICE_CENTS, PAYOUT_RATE } from './parking-fundraiser';
import { SITE_URL } from './seo';
import type { EventConfig } from './seo';

/**
 * Parking money.
 *
 * THE ONE RULE: every parking dollar from any source is a row in
 * parking_payments. The QR page, the organization's live page, the tracker and
 * the public ledger all read from this table and nothing computes parking
 * revenue anywhere else.
 *
 * That is not tidiness. Half of this money belongs to somebody else, and an
 * organization that is told it earned a number has to be able to see the rows
 * that number came from. A second place that adds up parking is a second answer
 * to a question with one right answer, and the vendor side of this site has
 * already been through that: the capacity rule lived in three files, the three
 * disagreed, and the homepage advertised booths that were not free.
 */

/** What one vehicle pays at the gate. */
export { PARKING_PRICE_CENTS, PAYOUT_RATE };

/** Where a parking payment came from. Mirrors the source check constraint. */
export const PARKING_SOURCES = ['qr', 'pos', 'cash'] as const;
export type ParkingSource = (typeof PARKING_SOURCES)[number];

/** What each source is called on a page somebody outside Coyoteville reads. */
export const SOURCE_LABELS: Record<string, string> = {
  qr: 'paid by phone',
  pos: 'card at the gate',
  cash: 'cash',
};

/* ------------------------------------------------------- the reference id */

/**
 * The prefix that tells the webhook a payment is parking rather than a vendor.
 *
 * The webhook maps an order's referenceId back to a row. A vendor's is a bare
 * application UUID; parking's is this prefix and the event slug. They cannot
 * collide: a UUID has no colon in it, and the prefix is checked before anything
 * tries to read the string as an id.
 */
export const PARKING_REFERENCE_PREFIX = 'parking:';

export function parkingReferenceId(eventSlug: string): string {
  return `${PARKING_REFERENCE_PREFIX}${eventSlug}`;
}

/** The event a parking referenceId names, or null if it is not one. */
export function eventSlugFromReference(reference: string | null | undefined): string | null {
  if (!reference || !reference.startsWith(PARKING_REFERENCE_PREFIX)) return null;
  const slug = reference.slice(PARKING_REFERENCE_PREFIX.length).trim();
  return slug || null;
}

/* --------------------------------------------------------------- the night */

/**
 * The event the gate is working right now: the soonest one not yet finished.
 *
 * Never a hardcoded slug. The QR code is printed once and taped to a post, so
 * the page behind it has to be right on every night after this one too.
 */
export async function currentParkingEvent(now: number = Date.now()): Promise<EventConfig | null> {
  const upcoming = (await getEvents())
    .filter((e) => endsAtMs(e) > now)
    .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
  return upcoming[0] ?? null;
}

/* ------------------------------------------------------------ the money */

export type ParkingTotals = {
  /** Every cent recorded for the event, from every source. */
  cents: number;
  /** Vehicles, which is not the row count: a cash tap can record several. */
  vehicles: number;
  /** Rows, which is what the ledger shows. */
  payments: number;
  /** The organization's half, rounded the one way it is rounded anywhere. */
  shareCents: number;
};

export function emptyTotals(): ParkingTotals {
  return { cents: 0, vehicles: 0, payments: 0, shareCents: 0 };
}

/** The organization's cut. One function, so the page and the payout agree. */
export function shareOf(grossCents: number): number {
  return Math.round(grossCents * PAYOUT_RATE);
}

export type ParkingRow = {
  id: string;
  event_slug: string;
  amount_cents: number;
  vehicle_count: number;
  source: string;
  square_payment_id: string | null;
  square_order_id: string | null;
  recorded_by: string | null;
  note: string | null;
  created_at: string;
};

const LEDGER_COLUMNS =
  'id, event_slug, amount_cents, vehicle_count, source, square_payment_id, ' +
  'square_order_id, recorded_by, note, created_at';

/**
 * The night's rows, newest first.
 *
 * Capped, because this is read by a page that polls and a busy night is a few
 * hundred rows rather than a few. The totals are computed from the same read,
 * so a cap that hid rows would also understate the money: the limit is set
 * above any plausible night and the totals query below is separate and
 * unlimited for exactly that reason.
 */
export async function getParkingLedger(eventSlug: string, limit = 500): Promise<ParkingRow[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('parking_payments')
      .select(LEDGER_COLUMNS)
      .eq('event_slug', eventSlug)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as unknown as ParkingRow[];
  } catch (err) {
    console.error('could not read the parking ledger', err);
    return [];
  }
}

/**
 * The totals, summed over every row for the event.
 *
 * Summed in code rather than by the database because the counts and the money
 * come off one read: two aggregate queries could be answered a moment apart and
 * disagree, and this number is shown to an organization next to the rows it
 * came from.
 */
export async function getParkingTotals(eventSlug: string): Promise<ParkingTotals> {
  if (!isSupabaseConfigured()) return emptyTotals();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('parking_payments')
      .select('amount_cents, vehicle_count')
      .eq('event_slug', eventSlug);

    if (error) throw error;

    const totals = emptyTotals();
    for (const row of (data ?? []) as { amount_cents: number; vehicle_count: number }[]) {
      totals.cents += Math.max(0, row.amount_cents ?? 0);
      totals.vehicles += Math.max(0, row.vehicle_count ?? 1);
      totals.payments += 1;
    }
    totals.shareCents = shareOf(totals.cents);
    return totals;
  } catch (err) {
    /* Zero rather than a guess. A total that is quietly wrong on a page an
       organization is watching is worse than one that is obviously stuck. */
    console.error('could not total parking payments', err);
    return emptyTotals();
  }
}

/**
 * Record a parking payment.
 *
 * Idempotent on square_payment_id, which is the column the database makes
 * unique. Square redelivers a webhook until it gets a 2xx and will happily send
 * the same payment twice, so the second insert has to be a no-op rather than a
 * second row: a duplicate here is money the organization is told it earned and
 * did not.
 *
 * Returns whether a row was actually written, so the caller can say which
 * happened rather than guessing.
 */
export async function recordParkingPayment(input: {
  eventSlug: string;
  amountCents: number;
  vehicleCount?: number;
  source: ParkingSource;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  recordedBy?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; inserted: boolean; id: string | null }> {
  if (!isSupabaseConfigured()) return { ok: false, inserted: false, id: null };

  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    /* The column is checked > 0. Refusing here says why, rather than letting
       Postgres reject it with a constraint name nobody reads. */
    console.error('refusing a parking payment with no amount', input);
    return { ok: false, inserted: false, id: null };
  }

  const supabase = getSupabaseAdmin();

  if (input.squarePaymentId) {
    const { data: seen } = await supabase
      .from('parking_payments')
      .select('id')
      .eq('square_payment_id', input.squarePaymentId)
      .maybeSingle();

    if (seen) return { ok: true, inserted: false, id: (seen as { id: string }).id };
  }

  const { data, error } = await supabase
    .from('parking_payments')
    .insert({
      event_slug: input.eventSlug,
      amount_cents: Math.round(input.amountCents),
      vehicle_count: Math.max(1, Math.round(input.vehicleCount ?? 1)),
      source: input.source,
      square_payment_id: input.squarePaymentId ?? null,
      square_order_id: input.squareOrderId ?? null,
      recorded_by: input.recordedBy ?? null,
      note: input.note ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    /* 23505 is the unique index on square_payment_id doing its job under a
       race: two webhook deliveries arriving at once both got past the read
       above. The row exists, which is the outcome that matters. */
    if ((error as { code?: string })?.code === '23505') {
      return { ok: true, inserted: false, id: null };
    }
    console.error('parking payment insert failed', error);
    return { ok: false, inserted: false, id: null };
  }

  return { ok: true, inserted: true, id: (data as { id: string }).id };
}

/* ----------------------------------------------------------- the payment link */

/**
 * The Square hosted checkout for one night's parking, created once.
 *
 * Not once per visitor. A link per car would be a Square API call on every page
 * load from a phone on a bad connection in a queue of traffic, which is the one
 * thing this page cannot afford.
 *
 * "Once" is kept without a column to store it in. The link is found back out of
 * Square by a description this code sets and nothing else does, and only
 * created when the search comes up empty, so a cold start finds the existing
 * link rather than making a second one. The result is cached in module memory
 * for the life of the instance on top of that.
 *
 * A column on events would be simpler and is worth adding the next time the
 * schema is touched. This works without one, and the schema is frozen tonight.
 */
function linkDescription(eventSlug: string): string {
  return `Coyoteville parking, ${eventSlug}`;
}

const linkCache = new Map<string, string>();

export async function getParkingCheckoutUrl(eventSlug: string): Promise<string | null> {
  if (!isSquareConfigured()) return null;

  const cached = linkCache.get(eventSlug);
  if (cached) return cached;

  const wanted = linkDescription(eventSlug);

  try {
    const square = getSquare();

    /* Look before creating. Square's list is paginated and newest first; the
       link for a night that is running was made recently, so a couple of pages
       is plenty. Walking the whole account would be slow and pointless. */
    let scanned = 0;
    for await (const link of await square.checkout.paymentLinks.list({ limit: 50 })) {
      scanned += 1;
      if (link.description === wanted && (link.url || link.longUrl)) {
        const url = (link.url || link.longUrl) as string;
        linkCache.set(eventSlug, url);
        return url;
      }
      if (scanned >= 200) break;
    }

    const created = await square.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      description: wanted,
      order: {
        locationId: getSquareLocationId(),
        /* What routes the webhook. A vendor's referenceId is a bare UUID; this
           one is prefixed, and the webhook branches on the prefix. */
        referenceId: parkingReferenceId(eventSlug),
        lineItems: [
          {
            name: 'Parking, one vehicle',
            quantity: '1',
            basePriceMoney: { amount: BigInt(PARKING_PRICE_CENTS), currency: 'USD' },
            note: 'Coyoteville, 150 N. Stadium Road, Alice TX.',
          },
        ],
      },
      checkoutOptions: {
        /* Apple Pay and Google Pay are on by default on a Square hosted
           checkout and are the whole point here: a driver with a phone in one
           hand does not type a card number. */
        askForShippingAddress: false,
        allowTipping: false,
        redirectUrl: `${SITE_URL}/park/thanks`,
      },
      paymentNote: `Coyoteville parking, ${eventSlug}`,
    });

    const link = created.paymentLink;
    const url = link?.url || link?.longUrl || null;
    if (url) linkCache.set(eventSlug, url);
    return url;
  } catch (err) {
    /* No link is a page that still says what parking costs and still shows the
       organization, with the button absent rather than broken. Cash and the
       reader at the gate both still work. */
    console.error('could not get a parking checkout link', err);
    return null;
  }
}

/* -------------------------------------------------------------- the org */

export type AwardedOrg = {
  id: string;
  name: string;
  logoPath: string | null;
};

/**
 * The organization working this event, read from org_event_awards.
 *
 * Never hardcoded. An award that has not been made yet returns null and the
 * page shows parking without an organization line, which is the honest state:
 * nobody has been drawn, so there is nobody to name.
 *
 * Deliberately not gated on published_at. The QR page goes up on the night the
 * organization is working, and the point of the line is to tell a driver where
 * their ten dollars is going.
 */
export async function getAwardedOrg(eventSlug: string): Promise<AwardedOrg | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabaseAdmin();

    const { data: award, error } = await supabase
      .from('org_event_awards')
      .select('org_application_id')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    if (error) throw error;

    const orgId = (award as { org_application_id: string | null } | null)?.org_application_id;
    if (!orgId) return null;

    const { data: org } = await supabase
      .from('org_applications')
      .select('id, org_name, logo_path')
      .eq('id', orgId)
      .maybeSingle();

    if (!org) return null;

    const row = org as { id: string; org_name: string; logo_path: string | null };
    return { id: row.id, name: row.org_name, logoPath: row.logo_path };
  } catch (err) {
    console.error('could not read the awarded organization', err);
    return null;
  }
}

/** "$1,250". Whole dollars: no parking figure here has cents. */
export function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
