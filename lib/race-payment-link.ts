import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSquare, getSquareLocationId, isSquareConfigured } from './square';
import { SITE_URL } from './seo';

/**
 * Square payment links for the race.
 *
 * Three reference shapes, because three different rows get settled and the
 * webhook has to know which table to look in from the referenceId alone:
 *
 *   race:<race_slug>:<registration_id>     one runner, one row
 *   racegroup:<race_slug>:<group_id>       a family or a team, one payment
 *   sponsor:<race_slug>:<sponsor_id>       a sponsorship
 *
 * Prefixed and colon separated, the same way parking is, so none of them can
 * be mistaken for a vendor application's bare UUID.
 *
 * Never a dashboard link. A link made by hand in Square carries no referenceId,
 * which is exactly how a whole evening of parking went unrecorded in September:
 * the webhook had nothing to match on and ignored every payment.
 */

export const RACE_REFERENCE_PREFIX = 'race:';
export const RACE_GROUP_REFERENCE_PREFIX = 'racegroup:';
export const RACE_SPONSOR_REFERENCE_PREFIX = 'sponsor:';

export function raceReferenceId(raceSlug: string, registrationId: string): string {
  return `${RACE_REFERENCE_PREFIX}${raceSlug}:${registrationId}`;
}

export function raceGroupReferenceId(raceSlug: string, groupId: string): string {
  return `${RACE_GROUP_REFERENCE_PREFIX}${raceSlug}:${groupId}`;
}

export function raceSponsorReferenceId(raceSlug: string, sponsorId: string): string {
  return `${RACE_SPONSOR_REFERENCE_PREFIX}${raceSlug}:${sponsorId}`;
}

export type RaceReference =
  | { kind: 'registration'; raceSlug: string; id: string }
  | { kind: 'group'; raceSlug: string; id: string }
  | { kind: 'sponsor'; raceSlug: string; id: string };

/**
 * Read a referenceId back, or null when it is not one of ours.
 *
 * Null is the important answer. A reference this does not recognise belongs to
 * the vendor path or to nothing, and guessing would settle the wrong row.
 */
export function raceFromReference(reference: string | null | undefined): RaceReference | null {
  if (!reference) return null;

  const table: [string, RaceReference['kind']][] = [
    [RACE_GROUP_REFERENCE_PREFIX, 'group'],
    [RACE_SPONSOR_REFERENCE_PREFIX, 'sponsor'],
    /* Last, because "race:" is a prefix of nothing else here but the group one
       starts with the same four letters and has to be tested first. */
    [RACE_REFERENCE_PREFIX, 'registration'],
  ];

  for (const [prefix, kind] of table) {
    if (!reference.startsWith(prefix)) continue;

    const rest = reference.slice(prefix.length);
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
