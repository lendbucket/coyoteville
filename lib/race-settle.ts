import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import type { RaceReference } from './race-payment-link';

/**
 * A race payment, settled.
 *
 * Three reference shapes land here and each one settles a different table.
 * They share this function rather than having three near copies in the webhook
 * because the rules are identical: find the row, refuse if it is already paid,
 * stamp it, and never let a redelivery count twice.
 *
 * Idempotent on square_payment_id, which is unique on all three tables. Square
 * redelivers until it gets a 2xx, so the second delivery of one payment has to
 * be a no op rather than a second stamp.
 */

export type SettleResult =
  | { ok: true; settled: boolean; reason?: string }
  | { ok: false; error: string };

const TABLE: Record<RaceReference['kind'], string> = {
  registration: 'race_registrations',
  group: 'race_groups',
  sponsor: 'race_sponsors',
};

export async function settleRacePayment(args: {
  reference: RaceReference;
  amountCents: number;
  squarePaymentId: string | null;
  squareOrderId: string | null;
  now?: number;
}): Promise<SettleResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'no database' };

  const table = TABLE[args.reference.kind];
  const supabase = getSupabaseAdmin();

  try {
    /* Already settled by an earlier delivery of this same payment. Checked
       before anything is written, so a redelivery cannot restamp paid_at and
       move a payment's recorded time. */
    if (args.squarePaymentId) {
      const { data: seen } = await supabase
        .from(table)
        .select('id')
        .eq('square_payment_id', args.squarePaymentId)
        .maybeSingle();

      if (seen) return { ok: true, settled: false, reason: 'already recorded' };
    }

    const { data: row, error: readError } = await supabase
      .from(table)
      .select('id, amount_cents, payment_status')
      .eq('id', args.reference.id)
      .maybeSingle();

    if (readError) throw readError;
    if (!row) return { ok: true, settled: false, reason: 'unknown row' };

    const existing = row as { id: string; amount_cents: number | null; payment_status: string };

    if (existing.payment_status === 'paid') {
      return { ok: true, settled: false, reason: 'already paid' };
    }

    /* What we asked for, against what Square took. A payment that does not
       cover the entry is not a place in the field. Logged rather than
       silently accepted, and the row stays unpaid so the tracker shows it. */
    const expected = Math.max(0, existing.amount_cents ?? 0);
    if (expected > 0 && args.amountCents < expected) {
      console.error('[race] underpayment', {
        table,
        id: existing.id,
        expected,
        paid: args.amountCents,
      });
      return { ok: true, settled: false, reason: 'underpaid' };
    }

    const { error: writeError } = await supabase
      .from(table)
      .update({
        payment_status: 'paid',
        paid_at: new Date(args.now ?? Date.now()).toISOString(),
        square_payment_id: args.squarePaymentId,
        square_order_id: args.squareOrderId,
      })
      .eq('id', existing.id)
      /* The guard that makes two simultaneous deliveries safe: only one of
         them finds the row still unpaid. */
      .eq('payment_status', existing.payment_status);

    if (writeError) throw writeError;

    /* A group's runners are paid when the group is. Their own rows carry no
       money, so this is a status rather than an amount. */
    if (args.reference.kind === 'group') {
      const { error: runnersError } = await supabase
        .from('race_registrations')
        .update({ payment_status: 'paid', paid_at: new Date(args.now ?? Date.now()).toISOString() })
        .eq('group_id', existing.id);

      if (runnersError) {
        console.error('[race] group paid but runners were not updated', existing.id, runnersError);
      }
    }

    return { ok: true, settled: true };
  } catch (err) {
    console.error('[race] settle failed', table, args.reference.id, err);
    return { ok: false, error: 'write failed' };
  }
}
