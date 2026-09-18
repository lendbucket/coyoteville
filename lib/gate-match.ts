/**
 * What the gate lookup passes around, and how a search matches.
 *
 * Split out of lib/gate-lookup so the browser can import it. That file is
 * server-only, because it holds the Square token and the service role client;
 * this one is data and one pure function, and the point of the split is that
 * the phone runs the identical matching rule against its cached copy rather
 * than a second implementation that can drift from it.
 */

export type GatePayment = {
  /** Square's payment id. The join key, and the tail of it is worth showing. */
  id: string;
  at: string;
  amountCents: number;
  /** Last four of the card. Null for a wallet or when Square has not said. */
  last4: string | null;
  cardBrand: string | null;
  /** What Square prints on the receipt. Short, and the driver has it. */
  receiptNumber: string | null;
  /** True when a parking_payments row exists for it. */
  recorded: boolean;
  /** 'parking' or 'donation', from our row. Null when we have not recorded it. */
  kind: string | null;
  eventSlug: string | null;
};

export type GateSnapshot = {
  ok: boolean;
  /** When this was built, so the phone can say how stale its copy is. */
  generatedAt: string;
  /** How far back it looked, in minutes. */
  windowMinutes: number;
  /** False when Square could not be reached, so last four is missing. */
  squareReachable: boolean;
  payments: GatePayment[];
};


/**
 * Does this payment match what somebody typed?
 *
 * Exported and pure so the browser runs the identical rule against its cached
 * copy. The whole point of the cache is that a search still answers with no
 * signal, and it can only do that if the matching does not need the server.
 *
 * Digits only, because everything a driver can read out is digits: four off the
 * card, or the receipt number off their phone. Punctuation and spaces are
 * stripped rather than refused, since a receipt number gets read aloud with
 * whatever is around it.
 */
export function matchesGateQuery(payment: GatePayment, rawQuery: string): boolean {
  const q = rawQuery.replace(/\D/g, '');
  if (q.length < 3) return false;

  if (q.length === 4 && payment.last4 === q) return true;

  const receipt = (payment.receiptNumber ?? '').replace(/\D/g, '');
  if (receipt && receipt.includes(q)) return true;

  /* The tail of the Square payment id, which is what the tracker and the
     dashboard show when there is no receipt number on the payment. */
  const idTail = payment.id.replace(/\D/g, '').slice(-6);
  if (q.length >= 4 && idTail.includes(q)) return true;

  return false;
}
