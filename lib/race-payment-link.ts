import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSquare, getSquareLocationId, isSquareConfigured } from './square';
import { SITE_URL } from './seo';

/**
 * Square payment links for the race.
 *
 * THE REFERENCE HAS A 40 CHARACTER LIMIT. Square rejects the whole
 * payment-links call with VALUE_TOO_LONG on order.reference_id, and because the
 * row is written before the link is created, the runner ends up with an unpaid
 * registration and no checkout. That happened in production: every race
 * payment link failed, because the old scheme ran to 58, 61 and 63 characters.
 *
 * So the reference carries the least it can. The row already knows its own
 * race_slug, and settleRacePayment looks a row up by id alone, so the only
 * thing the reference has to say is which table and which row:
 *
 *   r<32 hex>   a registration
 *   g<32 hex>   a group, meaning a family or a team
 *   s<32 hex>   a sponsorship
 *
 * One letter and a UUID with its hyphens removed. 33 characters, with seven to
 * spare, and it does not grow when a future race has a longer name. Shortening
 * the slug would have fixed today and broken again at the next race, which is
 * why the slug is gone from the reference entirely rather than trimmed.
 *
 * The old long form is still parsed, because a link created before this change
 * can still be paid and its webhook still has to settle the right row.
 *
 * parking: and donation: are untouched. They are well inside the limit and
 * they work.
 *
 * Never a dashboard link. A link made by hand in Square carries no referenceId,
 * which is exactly how a whole evening of parking went unrecorded in September:
 * the webhook had nothing to match on and ignored every payment.
 */

/** What Square allows on order.reference_id. Measured by it rejecting us. */
export const SQUARE_REFERENCE_MAX = 40;

/** The short form's one letter table markers. */
export const RACE_REF_REGISTRATION = 'r';
export const RACE_REF_GROUP = 'g';
export const RACE_REF_SPONSOR = 's';

/* The long form, kept only so references already in flight still parse. */
const LEGACY_RACE_PREFIX = 'race:';
const LEGACY_GROUP_PREFIX = 'racegroup:';
const LEGACY_SPONSOR_PREFIX = 'sponsor:';

/** A UUID with its hyphens taken out, or null if it was not a UUID. */
function packUuid(id: string): string | null {
  const bare = id.replace(/-/g, '').toLowerCase();
  return /^[0-9a-f]{32}$/.test(bare) ? bare : null;
}

/** The hyphens put back, 8-4-4-4-12. */
function unpackUuid(bare: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(bare)) return null;
  const b = bare.toLowerCase();
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}

function shortReference(marker: string, id: string): string {
  const packed = packUuid(id);
  if (!packed) {
    /* Not a UUID. Rather than build something Square will reject, or silently
       truncate an identifier that then matches no row, refuse here where the
       stack trace says which row. */
    throw new Error(`Cannot build a payment reference from "${id}": not a UUID.`);
  }
  return `${marker}${packed}`;
}

export function raceReferenceId(_raceSlug: string, registrationId: string): string {
  return shortReference(RACE_REF_REGISTRATION, registrationId);
}

export function raceGroupReferenceId(_raceSlug: string, groupId: string): string {
  return shortReference(RACE_REF_GROUP, groupId);
}

export function raceSponsorReferenceId(_raceSlug: string, sponsorId: string): string {
  return shortReference(RACE_REF_SPONSOR, sponsorId);
}

export type RaceReference = {
  kind: 'registration' | 'group' | 'sponsor';
  /**
   * The slug, when the reference carried one.
   *
   * Null on the short form, which is every reference built from now on. The
   * row knows its own race_slug and the lookup is by id, so nothing depends on
   * this; it is only a label on the alert email.
   */
  raceSlug: string | null;
  id: string;
};

const SHORT_KINDS: Record<string, RaceReference['kind']> = {
  [RACE_REF_REGISTRATION]: 'registration',
  [RACE_REF_GROUP]: 'group',
  [RACE_REF_SPONSOR]: 'sponsor',
};

/**
 * Read a referenceId back, or null when it is not one of ours.
 *
 * Null is the important answer. A reference this does not recognise belongs to
 * the vendor or parking path or to nothing, and guessing would settle the
 * wrong row.
 */
export function raceFromReference(reference: string | null | undefined): RaceReference | null {
  if (!reference) return null;

  const value = reference.trim();

  /* The short form: one letter, then a packed UUID and nothing else. The
     length and the hex test together mean this cannot collide with a parking
     or donation reference, which are prefixed words followed by a colon. */
  if (value.length === 33) {
    const kind = SHORT_KINDS[value[0]];
    const id = kind ? unpackUuid(value.slice(1)) : null;
    if (kind && id) return { kind, raceSlug: null, id };
  }

  /* The long form, for anything created before the limit was hit. */
  const legacy: [string, RaceReference['kind']][] = [
    [LEGACY_GROUP_PREFIX, 'group'],
    [LEGACY_SPONSOR_PREFIX, 'sponsor'],
    /* Last: "racegroup:" starts with the same four letters as "race:" and has
       to be tested first. */
    [LEGACY_RACE_PREFIX, 'registration'],
  ];

  for (const [prefix, kind] of legacy) {
    if (!value.startsWith(prefix)) continue;

    const rest = value.slice(prefix.length);
    const split = rest.lastIndexOf(':');
    if (split < 1) return null;

    const raceSlug = rest.slice(0, split).trim();
    const id = rest.slice(split + 1).trim();
    if (!raceSlug || !id) return null;

    return { kind, raceSlug, id };
  }

  return null;
}

/** One link, for whichever of the three this is. */
export async function createRacePaymentLink(args: {
  referenceId: string;
  amountCents: number;
  /** What the receipt calls it. */
  lineName: string;
  note: string;
  buyerEmail: string;
  redirectPath: string;
}): Promise<string> {
  if (!isSquareConfigured()) throw new Error('Square is not configured.');

  if (!Number.isFinite(args.amountCents) || args.amountCents <= 0) {
    throw new Error('There is nothing to charge.');
  }

  const square = getSquare();

  const response = await square.checkout.paymentLinks.create({
    idempotencyKey: randomUUID(),
    description: args.lineName,
    order: {
      locationId: getSquareLocationId(),
      referenceId: args.referenceId,
      lineItems: [
        {
          name: args.lineName,
          quantity: '1',
          basePriceMoney: { amount: BigInt(args.amountCents), currency: 'USD' },
          note: args.note.slice(0, 480),
        },
      ],
    },
    checkoutOptions: {
      redirectUrl: `${SITE_URL}${args.redirectPath}`,
      askForShippingAddress: false,
      allowTipping: false,
    },
    prePopulatedData: { buyerEmail: args.buyerEmail },
    paymentNote: args.note.slice(0, 480),
  });

  const link = response.paymentLink;
  const url = link?.url || link?.longUrl || null;
  if (!url) throw new Error('Square returned no payment link URL.');

  return url;
}
