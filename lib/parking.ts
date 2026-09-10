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

/**
 * Where a parking payment came from.
 *
 * Parking is QR only: every payment goes through /park and the Square hosted
 * link, so every row is 'qr'. The constraint still permits 'pos' and 'cash' and
 * nothing writes them, which is why they are in the type and have no label.
 * Leaving them permitted costs nothing and keeps the door open; giving them a
 * label on a public page would advertise a way to pay that does not exist.
 */
export const PARKING_SOURCES = ['qr', 'pos', 'cash'] as const;
export type ParkingSource = (typeof PARKING_SOURCES)[number];

/**
 * What a payment is called on a page somebody outside Coyoteville reads.
 *
 * One answer, because there is one way to pay. A row that somehow carried
 * another source would read as a payment rather than as a blank, which is the
 * right failure: the organization's ledger should never show a line it cannot
 * name.
 */
export function sourceLabel(_source: string): string {
  return 'paid by phone';
}

/**
 * What a payment is for.
 *
 * 'parking' is somebody buying a space and half of it goes to the organization.
 * 'donation' is a gift to that organization and all of it does, never split.
 * One table because it is one night's money and the organization is shown both;
 * one column apart because they are paid out under two different rules.
 */
export const PARKING_KINDS = ['parking', 'donation'] as const;
export type ParkingKind = (typeof PARKING_KINDS)[number];

/** What a line is called on the organization's ledger. */
export function kindLabel(kind: string): string {
  return kind === 'donation' ? 'gift' : 'parking';
}

/** What a driver can add for the team. Nothing larger: it is a car window. */
export const DONATION_AMOUNTS = [500, 1000, 2000] as const;

export const DONATION_REFERENCE_PREFIX = 'donation:';

export function donationReferenceId(eventSlug: string, amountCents: number): string {
  return `${DONATION_REFERENCE_PREFIX}${eventSlug}:${amountCents}`;
}

/** The event and amount a donation referenceId names, or null. */
export function donationFromReference(
  reference: string | null | undefined
): { eventSlug: string; amountCents: number } | null {
  if (!reference || !reference.startsWith(DONATION_REFERENCE_PREFIX)) return null;

  const rest = reference.slice(DONATION_REFERENCE_PREFIX.length);
  const at = rest.lastIndexOf(':');
  if (at < 1) return null;

  const eventSlug = rest.slice(0, at).trim();
  const amountCents = Number(rest.slice(at + 1));

  if (!eventSlug || !Number.isFinite(amountCents) || amountCents <= 0) return null;
  return { eventSlug, amountCents };
}

/* --------------------------------------------------------- the share basis */

/**
 * What the organization's 50 percent is calculated on, per event.
 *
 * Per event and not global, because it is a term of an agreement rather than a
 * setting. The organizations working today signed terms that say 50 percent of
 * gross, before any expense of any kind, and Square's fee is an expense: their
 * share is computed on gross and the page says so. Changing that for a future
 * night means changing the terms first and then adding the slug here, in that
 * order.
 *
 * Anything not listed uses the default, which is what the current terms say.
 */
export type ShareBasis = 'gross' | 'net';

export const DEFAULT_SHARE_BASIS: ShareBasis = 'gross';

const SHARE_BASIS_BY_EVENT: Record<string, ShareBasis> = {
  'home-game-2026-09-11': 'gross',
};

export function shareBasisFor(eventSlug: string): ShareBasis {
  return SHARE_BASIS_BY_EVENT[eventSlug] ?? DEFAULT_SHARE_BASIS;
}

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
  /** Parking only. What was taken for spaces, before anything is deducted. */
  cents: number;
  /** Vehicles. Not the row count, and not counting gifts. */
  vehicles: number;
  /** Parking rows. */
  payments: number;
  /**
   * What Square actually charged, summed off the payments themselves.
   *
   * Both kinds, because it is what Square took from the night. Null fees are
   * simply not added: a fee Square has not calculated yet is unknown, not zero,
   * and feesPending says how many rows are in that state so a page can say so
   * rather than quietly understating the total.
   */
  feeCents: number;
  feesPending: number;
  /** Gifts. Every cent of these goes to the organization, never split. */
  donationCents: number;
  donations: number;
  /** The organization's half of parking, on the basis this event's terms set. */
  shareCents: number;
  /** Share plus gifts. What the organization is actually owed. */
  owedCents: number;
  basis: ShareBasis;
};

export function emptyTotals(basis: ShareBasis = DEFAULT_SHARE_BASIS): ParkingTotals {
  return {
    cents: 0,
    vehicles: 0,
    payments: 0,
    feeCents: 0,
    feesPending: 0,
    donationCents: 0,
    donations: 0,
    shareCents: 0,
    owedCents: 0,
    basis,
  };
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
  kind: string;
  square_fee_cents: number | null;
  square_payment_id: string | null;
  square_order_id: string | null;
  recorded_by: string | null;
  note: string | null;
  created_at: string;
};

const LEDGER_COLUMNS =
  'id, event_slug, amount_cents, vehicle_count, source, kind, square_fee_cents, ' +
  'square_payment_id, square_order_id, recorded_by, note, created_at';

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
  const basis = shareBasisFor(eventSlug);
  if (!isSupabaseConfigured()) return emptyTotals(basis);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('parking_payments')
      .select('amount_cents, vehicle_count, kind, square_fee_cents')
      .eq('event_slug', eventSlug);

    if (error) throw error;

    const totals = emptyTotals(basis);

    for (const row of (data ?? []) as {
      amount_cents: number;
      vehicle_count: number;
      kind: string | null;
      square_fee_cents: number | null;
    }[]) {
      const amount = Math.max(0, row.amount_cents ?? 0);

      if ((row.kind ?? 'parking') === 'donation') {
        totals.donationCents += amount;
        totals.donations += 1;
      } else {
        totals.cents += amount;
        totals.vehicles += Math.max(0, row.vehicle_count ?? 1);
        totals.payments += 1;
      }

      /* Null is unknown, not zero. Square calculates the fee after the payment
         completes, so a row taken five minutes ago legitimately has none yet. */
      if (row.square_fee_cents === null || row.square_fee_cents === undefined) {
        totals.feesPending += 1;
      } else {
        totals.feeCents += Math.max(0, row.square_fee_cents);
      }
    }

    /* On 'gross' the fee is not deducted before the split, which is what the
       terms these organizations signed say. On 'net' it is. One place decides,
       so the page, the ledger and the payout cannot disagree. */
    const shareBase =
      basis === 'net' ? Math.max(0, totals.cents - totals.feeCents) : totals.cents;

    totals.shareCents = shareOf(shareBase);
    totals.owedCents = totals.shareCents + totals.donationCents;

    return totals;
  } catch (err) {
    /* Zero rather than a guess. A total that is quietly wrong on a page an
       organization is watching is worse than one that is obviously stuck. */
    console.error('could not total parking payments', err);
    return emptyTotals(basis);
  }
}

/**
 * Record a parking payment.
 *
 * Idempotent on square_payment_id for the money, and deliberately not a plain
 * "insert if new".
 *
 * Square redelivers a webhook until it gets a 2xx and will happily send the same
 * payment twice, so a second insert has to be a no-op: a duplicate here is money
 * the organization is told it earned and did not.
 *
 * But a later delivery is not always a duplicate. Square does not have the
 * processing fee when a payment completes; it calculates it after settlement and
 * sends another payment.updated for the same payment once it knows, normally
 * within minutes. So a redelivery that arrives carrying a fee for a row that has
 * none fills it in. The money is written once; the fee is written when it turns
 * up.
 *
 * Returns what happened, so the caller can say which rather than guessing.
 */
export async function recordParkingPayment(input: {
  eventSlug: string;
  amountCents: number;
  vehicleCount?: number;
  source: ParkingSource;
  kind?: ParkingKind;
  /** What Square charged. Null when Square has not calculated it yet. */
  feeCents?: number | null;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  recordedBy?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; inserted: boolean; feeRecorded: boolean; id: string | null }> {
  if (!isSupabaseConfigured()) return { ok: false, inserted: false, feeRecorded: false, id: null };

  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    /* The column is checked > 0. Refusing here says why, rather than letting
       Postgres reject it with a constraint name nobody reads. */
    console.error('refusing a parking payment with no amount', input);
    return { ok: false, inserted: false, feeRecorded: false, id: null };
  }

  const supabase = getSupabaseAdmin();
  const fee =
    input.feeCents === null || input.feeCents === undefined
      ? null
      : Math.max(0, Math.round(input.feeCents));

  if (input.squarePaymentId) {
    const { data: seen } = await supabase
      .from('parking_payments')
      .select('id, square_fee_cents')
      .eq('square_payment_id', input.squarePaymentId)
      .maybeSingle();

    if (seen) {
      const row = seen as { id: string; square_fee_cents: number | null };

      /* The redelivery that carries the fee. Only written when the row has
         none: a fee already recorded is Square's own number and is not
         overwritten by a later delivery of the same thing. */
      if (fee !== null && (row.square_fee_cents === null || row.square_fee_cents === undefined)) {
        const { error: feeError } = await supabase
          .from('parking_payments')
          .update({ square_fee_cents: fee })
          .eq('id', row.id);

        if (feeError) {
          console.error('could not record the Square fee', row.id, feeError);
          return { ok: true, inserted: false, feeRecorded: false, id: row.id };
        }
        return { ok: true, inserted: false, feeRecorded: true, id: row.id };
      }

      return { ok: true, inserted: false, feeRecorded: false, id: row.id };
    }
  }

  const { data, error } = await supabase
    .from('parking_payments')
    .insert({
      event_slug: input.eventSlug,
      amount_cents: Math.round(input.amountCents),
      /* Floored at zero, not at one. A gift is money and not a car, and the
         floor of one silently turned every donation into a vehicle on the
         organization's own count. Caught by check-webhook-settles. */
      vehicle_count: Math.max(0, Math.round(input.vehicleCount ?? 1)),
      source: input.source,
      kind: input.kind ?? 'parking',
      square_fee_cents: fee,
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
      return { ok: true, inserted: false, feeRecorded: false, id: null };
    }
    console.error('parking payment insert failed', error);
    return { ok: false, inserted: false, feeRecorded: false, id: null };
  }

  return {
    ok: true,
    inserted: true,
    feeRecorded: fee !== null,
    id: (data as { id: string }).id,
  };
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
function linkDescription(eventSlug: string, amountCents?: number): string {
  return amountCents === undefined
    ? `Coyoteville parking, ${eventSlug}`
    : `Coyoteville gift ${amountCents}, ${eventSlug}`;
}

const linkCache = new Map<string, string>();

/**
 * One stored Square link, found or created.
 *
 * Four links per night now rather than one: parking, and a gift at each of the
 * three amounts. Still created once each, found back out of Square by a
 * description this code sets and nothing else does, and cached in module memory
 * on top of that. A driver's page load never creates anything.
 */
async function storedLink(args: {
  cacheKey: string;
  description: string;
  referenceId: string;
  amountCents: number;
  lineName: string;
  paymentNote: string;
  redirectPath: string;
}): Promise<string | null> {
  if (!isSquareConfigured()) return null;

  const cached = linkCache.get(args.cacheKey);
  if (cached) return cached;

  try {
    const square = getSquare();

    let scanned = 0;
    for await (const link of await square.checkout.paymentLinks.list({ limit: 50 })) {
      scanned += 1;
      if (link.description === args.description && (link.url || link.longUrl)) {
        const url = (link.url || link.longUrl) as string;
        linkCache.set(args.cacheKey, url);
        return url;
      }
      if (scanned >= 200) break;
    }

    const created = await square.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      description: args.description,
      order: {
        locationId: getSquareLocationId(),
        referenceId: args.referenceId,
        lineItems: [
          {
            name: args.lineName,
            quantity: '1',
            basePriceMoney: { amount: BigInt(args.amountCents), currency: 'USD' },
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
        redirectUrl: `${SITE_URL}${args.redirectPath}`,
      },
      paymentNote: args.paymentNote,
    });

    const link = created.paymentLink;
    const url = link?.url || link?.longUrl || null;
    if (url) linkCache.set(args.cacheKey, url);
    return url;
  } catch (err) {
    console.error('could not get a Square link', args.description, err);
    return null;
  }
}

/**
 * Gifts to the organization, one stored link per amount.
 *
 * A separate link per amount rather than one link with a quantity, because a
 * Square hosted checkout does not ask a driver to pick a number and should not:
 * three buttons is one tap, and one tap is what this page gets.
 */
export async function getDonationCheckoutUrls(
  eventSlug: string
): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  if (!isSquareConfigured()) return out;

  for (const amount of DONATION_AMOUNTS) {
    const url = await storedLink({
      cacheKey: `donation:${eventSlug}:${amount}`,
      description: linkDescription(eventSlug, amount),
      referenceId: donationReferenceId(eventSlug, amount),
      amountCents: amount,
      lineName: 'Gift to the team',
      paymentNote: `Coyoteville gift, ${eventSlug}`,
      redirectPath: '/park/thanks/gift',
    });
    if (url) out[amount] = url;
  }

  return out;
}

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
