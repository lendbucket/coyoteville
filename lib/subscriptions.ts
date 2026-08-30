import 'server-only';
import { getSquare, getSquareLocationId, isSquareConfigured } from './square';
import { MONTHLY_PRICING, todayKey, type MonthlySpot } from './booking';

/**
 * Square Subscriptions, for the permanent monthly spot.
 *
 * The shape of the flow, and why:
 *
 *   At signup the browser tokenises a card with the Web Payments SDK and this
 *   file stores it against a Square customer. Nothing is charged. That is the
 *   authorisation the vendor gives, and it is all that happens until somebody
 *   has looked at the application.
 *
 *   On approval the subscription is created, which is the first charge. On
 *   denial the card on file is disabled and no money ever moved, so there is
 *   nothing to refund. That is why a monthly denial is a void rather than a
 *   refund, and why the denial email for one says nothing was charged.
 *
 *   Renewal, failure and cancellation all arrive as webhooks. Nothing here
 *   polls Square.
 *
 * Two plan variations have to exist in the Square dashboard, one per spot type,
 * and their ids come in through the environment. They are not created from code
 * on purpose: a catalog object created by a deploy is a catalog object nobody
 * can find in the dashboard when the price needs changing.
 */

export type SubscriptionOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

/** Detail out of a Square SDK error, which carries it in an errors array. */
function detailOf(err: unknown, fallback: string): string {
  return (
    (err as { errors?: { detail?: string }[] })?.errors?.[0]?.detail ||
    (err as Error)?.message ||
    fallback
  );
}

export function planVariationIdFor(spot: MonthlySpot): string | null {
  const id =
    spot === 'truck'
      ? process.env.SQUARE_MONTHLY_TRUCK_PLAN_VARIATION_ID
      : process.env.SQUARE_MONTHLY_BOOTH_PLAN_VARIATION_ID;
  return id && id.trim() ? id.trim() : null;
}

/** True when both plan variations are configured and Square is connected. */
export function isSubscriptionsConfigured(): boolean {
  return (
    isSquareConfigured() &&
    Boolean(planVariationIdFor('booth')) &&
    Boolean(planVariationIdFor('truck'))
  );
}

/* ------------------------------------------------------- card on file */

export type StoredCard = {
  customerId: string;
  cardId: string;
  /** Last four and brand, for showing the vendor which card is on file. */
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

/**
 * Create a Square customer and store the tokenised card against it.
 *
 * `sourceId` is the single use token the Web Payments SDK produced in the
 * browser. It never touches this server as a card number: by the time it gets
 * here it is already a token, which is the entire point of tokenising in the
 * page. `verificationToken` is the Strong Customer Authentication result, also
 * from the browser, and is passed straight through.
 */
export async function storeCardOnFile(args: {
  sourceId: string;
  verificationToken?: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  /** The application id, used as the idempotency key so a retry is safe. */
  reference: string;
}): Promise<SubscriptionOutcome<StoredCard>> {
  if (!isSquareConfigured()) {
    return fail('Card payments are not connected yet. Email us and we will get you set up.');
  }

  try {
    const square = getSquare();

    const customerResponse = await square.customers.create({
      idempotencyKey: `cvcust-${args.reference}`.slice(0, 45),
      givenName: args.contactName.slice(0, 300),
      companyName: args.businessName.slice(0, 500),
      emailAddress: args.email.slice(0, 254),
      phoneNumber: args.phone.slice(0, 17),
      referenceId: args.reference,
      note: 'Coyoteville permanent monthly spot',
    });

    const customerId = customerResponse.customer?.id;
    if (!customerId) {
      return fail('Square did not create a customer record. Nothing was charged.');
    }

    const cardResponse = await square.cards.create({
      idempotencyKey: `cvcard-${args.reference}`.slice(0, 45),
      sourceId: args.sourceId,
      ...(args.verificationToken ? { verificationToken: args.verificationToken } : {}),
      card: {
        customerId,
        cardholderName: args.contactName.slice(0, 96),
        referenceId: args.reference,
      },
    });

    const card = cardResponse.card;
    if (!card?.id) {
      const message = cardResponse.errors?.[0]?.detail;
      return fail(message || 'That card could not be saved. Check the details and try again.');
    }

    return {
      ok: true,
      value: {
        customerId,
        cardId: card.id,
        brand: card.cardBrand ?? null,
        last4: card.last4 ?? null,
        expMonth: card.expMonth ? Number(card.expMonth) : null,
        expYear: card.expYear ? Number(card.expYear) : null,
      },
    };
  } catch (err) {
    console.error('storing card on file failed', args.reference, err);
    return fail(
      detailOf(err, 'That card could not be saved. Check the details and try again.')
    );
  }
}

/**
 * Disable a card on file.
 *
 * Called when a monthly application is denied. Nothing was ever charged to it,
 * so this is the whole of the unwind: the vendor's card stops being held by us
 * the moment the decision is made.
 */
export async function releaseCardOnFile(cardId: string): Promise<SubscriptionOutcome<true>> {
  if (!isSquareConfigured()) return fail('Square is not connected.');

  try {
    await getSquare().cards.disable({ cardId });
    return { ok: true, value: true };
  } catch (err) {
    console.error('could not disable card on file', cardId, err);
    return fail(detailOf(err, 'The card on file could not be released.'));
  }
}

/* ------------------------------------------------------- subscription */

export type StartedSubscription = {
  subscriptionId: string;
  status: string;
  /** Paid through, as a day key. Null until Square has billed the first period. */
  chargedThroughDate: string | null;
  startDate: string;
};

/**
 * Start billing. This is the first charge, so it runs on approval and never
 * before.
 *
 * The idempotency key is derived from the application id, so a double tap on
 * approve, a retry, or a second process handling the same decision cannot start
 * two subscriptions against one vendor.
 */
export async function startSubscription(args: {
  applicationId: string;
  customerId: string;
  cardId: string;
  spot: MonthlySpot;
}): Promise<SubscriptionOutcome<StartedSubscription>> {
  const planVariationId = planVariationIdFor(args.spot);

  if (!planVariationId) {
    return fail(
      `No Square plan variation is configured for a ${args.spot} spot. Set SQUARE_MONTHLY_${args.spot.toUpperCase()}_PLAN_VARIATION_ID.`
    );
  }

  try {
    const response = await getSquare().subscriptions.create({
      idempotencyKey: `cvsub-${args.applicationId}`.slice(0, 45),
      locationId: getSquareLocationId(),
      planVariationId,
      customerId: args.customerId,
      cardId: args.cardId,
      // Today in the park's timezone. Square treats the start date as a plain
      // date in the location's zone, so sending a UTC date could start a spot a
      // day early for anyone approved late in the evening.
      startDate: todayKey(),
      timezone: 'America/Chicago',
    });

    const subscription = response.subscription;

    if (!subscription?.id) {
      const message = response.errors?.[0]?.detail;
      return fail(message || 'Square did not start the subscription.');
    }

    return {
      ok: true,
      value: {
        subscriptionId: subscription.id,
        status: subscription.status ?? 'ACTIVE',
        chargedThroughDate: subscription.chargedThroughDate ?? null,
        startDate: subscription.startDate ?? todayKey(),
      },
    };
  } catch (err) {
    console.error('could not start subscription', args.applicationId, err);
    return fail(detailOf(err, 'The subscription could not be started with Square.'));
  }
}

/**
 * Cancel at the end of the paid period.
 *
 * Square's cancel endpoint is exactly this behaviour: it sets the subscription
 * to end when the current billing period runs out rather than stopping it dead,
 * which is the rule the agreement states. There is no mid period cancellation
 * available here and none is wanted, because the vendor has paid for the month
 * and keeps the spot for it.
 */
export async function cancelAtPeriodEnd(
  subscriptionId: string
): Promise<SubscriptionOutcome<{ status: string; chargedThroughDate: string | null; canceledDate: string | null }>> {
  if (!isSquareConfigured()) return fail('Square is not connected.');

  try {
    const response = await getSquare().subscriptions.cancel({ subscriptionId });
    const subscription = response.subscription;

    if (!subscription) {
      return fail(response.errors?.[0]?.detail || 'Square did not confirm the cancellation.');
    }

    return {
      ok: true,
      value: {
        status: subscription.status ?? 'CANCELED',
        chargedThroughDate: subscription.chargedThroughDate ?? null,
        canceledDate: subscription.canceledDate ?? null,
      },
    };
  } catch (err) {
    console.error('could not cancel subscription', subscriptionId, err);
    return fail(detailOf(err, 'The cancellation could not be sent to Square.'));
  }
}

/** Read one subscription back, for reconciling what the tracker shows. */
export async function readSubscription(subscriptionId: string) {
  try {
    return (await getSquare().subscriptions.get({ subscriptionId })).subscription ?? null;
  } catch (err) {
    console.error('could not read subscription', subscriptionId, err);
    return null;
  }
}

/* ------------------------------------------------------------- status */

/**
 * Square's subscription status, mapped to the vocabulary the row stores.
 *
 * Square says ACTIVE, CANCELED, DEACTIVATED, PAUSED and PENDING. DEACTIVATED is
 * what a subscription becomes when Square gives up after failing to collect, so
 * it lands on 'past_due' rather than 'canceled': the difference matters to
 * whoever is looking at the tracker deciding whether to chase somebody.
 */
export function mapSubscriptionStatus(square: string | null | undefined): string {
  switch ((square ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'PENDING':
      return 'pending';
    case 'PAUSED':
      return 'paused';
    case 'DEACTIVATED':
      return 'past_due';
    case 'CANCELED':
      return 'canceled';
    default:
      return 'pending';
  }
}

/** The monthly fee for a spot type, formatted for a sentence. */
export function monthlyPriceLabel(spot: MonthlySpot): string {
  return MONTHLY_PRICING[spot].price;
}
