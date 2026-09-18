import 'server-only';
import { getSquare, getSquareLocationId, isSquareConfigured } from './square';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import type { GatePayment, GateSnapshot } from './gate-match';

export type { GatePayment, GateSnapshot } from './gate-match';
export { matchesGateQuery } from './gate-match';

/**
 * Recent parking payments, as a person at the gate needs them.
 *
 * Somebody says they paid and their confirmation has not come through. The
 * question is not "what does our table say", it is "did Square take their
 * money", and those are two different questions with two different answers
 * when a webhook is late. So both are read and both are reported:
 *
 *   Square is the authority on whether they paid. The card's last four and the
 *   receipt number are the only things a driver can actually show you, and both
 *   live on Square's payment object and nowhere in our database.
 *
 *   parking_payments is the authority on whether we recorded it. A payment that
 *   Square has and we do not is a real payment and a late webhook, which is
 *   exactly the case this exists for, and it says so rather than reading as a
 *   miss.
 *
 * There is deliberately no phone number here. Square's Payment carries no phone
 * field at all, the hosted checkout never asks for one, and parking has no form
 * to collect one in. A phone search would be a box that always says no.
 */

/** Two hours covers a gate queue and keeps the Square page small. */
export const GATE_WINDOW_MINUTES = 120;

/** More than a busy night produces in two hours, and one Square page. */
const MAX_PAYMENTS = 200;

function centsOf(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * Build the snapshot.
 *
 * Square first, our rows second, joined on the payment id. If Square is
 * unreachable the snapshot is still returned with whatever we recorded, marked
 * so the page can say the card digits are missing rather than pretend nobody
 * matched.
 */
export async function getGateSnapshot(
  now: number = Date.now(),
  windowMinutes: number = GATE_WINDOW_MINUTES
): Promise<GateSnapshot> {
  const since = new Date(now - windowMinutes * 60_000).toISOString();

  const empty: GateSnapshot = {
    ok: false,
    generatedAt: new Date(now).toISOString(),
    windowMinutes,
    squareReachable: false,
    payments: [],
  };

  if (!isSupabaseConfigured()) return empty;

  /* Our rows for the window. Keyed by Square payment id, which is what the
     webhook captures and what Square's own list comes back with. */
  const ours = new Map<string, { kind: string; eventSlug: string }>();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('parking_payments')
      .select('square_payment_id, kind, event_slug, created_at')
      .gte('created_at', since);

    if (error) throw error;

    for (const row of (data ?? []) as {
      square_payment_id: string | null;
      kind: string | null;
      event_slug: string;
    }[]) {
      if (!row.square_payment_id) continue;
      ours.set(row.square_payment_id, {
        kind: row.kind ?? 'parking',
        eventSlug: row.event_slug,
      });
    }
  } catch (err) {
    console.error('gate lookup could not read parking_payments', err);
    return empty;
  }

  /* Square's side. Everything taken on this location in the window, which is
     what carries the card digits and the receipt number. */
  const payments: GatePayment[] = [];
  let squareReachable = false;

  if (isSquareConfigured()) {
    try {
      const square = getSquare();
      let seen = 0;

      for await (const payment of await square.payments.list({
        locationId: getSquareLocationId(),
        beginTime: since,
        sortOrder: 'DESC',
      })) {
        seen += 1;
        if (seen > MAX_PAYMENTS) break;

        const id = payment.id;
        if (!id) continue;
        if ((payment.status ?? '') !== 'COMPLETED') continue;

        const mine = ours.get(id);
        const card = payment.cardDetails?.card;

        payments.push({
          id,
          at: payment.createdAt ?? new Date(now).toISOString(),
          amountCents: centsOf(payment.amountMoney?.amount),
          last4: card?.last4 ?? null,
          cardBrand: card?.cardBrand ?? null,
          receiptNumber: payment.receiptNumber ?? null,
          recorded: Boolean(mine),
          kind: mine?.kind ?? null,
          eventSlug: mine?.eventSlug ?? null,
        });
      }

      squareReachable = true;
    } catch (err) {
      /* A Square outage is not a reason to answer nothing. Our rows still say
         what landed; the card digits simply are not available. */
      console.error('gate lookup could not read Square', err);
    }
  }

  /* Anything we recorded that Square's page did not return, so a row is never
     invisible because the window or the ordering cut it off. */
  const listed = new Set(payments.map((p) => p.id));
  for (const [id, mine] of ours) {
    if (listed.has(id)) continue;
    payments.push({
      id,
      at: new Date(now).toISOString(),
      amountCents: 0,
      last4: null,
      cardBrand: null,
      receiptNumber: null,
      recorded: true,
      kind: mine.kind,
      eventSlug: mine.eventSlug,
    });
  }

  payments.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    windowMinutes,
    squareReachable,
    payments,
  };
}
