import { NextResponse } from 'next/server';
import { LIVE_PURPOSE, verifyDocumentToken } from '@/lib/doc-token';
import { getLiveSnapshot, timeLabel } from '@/lib/fundraiser-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The organization's live numbers, for their own page to poll.
 *
 * Keyed by the token and nothing else. There is no session here and there is
 * not meant to be: the organization's contact gets a link by text and opens it
 * on a phone in a stand, and asking them to hold an account for one night would
 * mean nobody looks at it.
 *
 * The token is checked against the id in the same query string, so editing the
 * id invalidates it rather than walking to the next organization's money.
 *
 * Returns aggregates and ledger lines only. No payer, no Square id, no order,
 * nothing about who paid. An organization is entitled to watch its money arrive
 * and is not entitled to a list of who arrived.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('t');

  if (!UUID.test(id) || !verifyDocumentToken(LIVE_PURPOSE, id, token)) {
    /* One answer for a bad token and an unknown organization alike, so this
       cannot be used to find out which organization ids exist. */
    return NextResponse.json({ ok: false, error: 'That link is not valid.' }, { status: 404 });
  }

  const snapshot = await getLiveSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: 'That link is not valid.' }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      /* One object, so the page cannot end up half updated: every figure on
         screen comes from the same read of the same table. */
      numbers: {
        cents: snapshot.totals.cents,
        vehicles: snapshot.totals.vehicles,
        feeCents: snapshot.totals.feeCents,
        feesPending: snapshot.totals.feesPending,
        donationCents: snapshot.totals.donationCents,
        donations: snapshot.totals.donations,
        shareCents: snapshot.totals.shareCents,
        owedCents: snapshot.totals.owedCents,
        basis: snapshot.totals.basis,
      },
      paidAtISO: snapshot.paidAtISO,
      ledger: snapshot.ledger.map((line) => ({
        id: line.id,
        time: timeLabel(line.at),
        amountCents: line.amountCents,
        label: line.label,
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
