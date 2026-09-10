import { NextResponse } from 'next/server';
import { currentParkingEvent, getAwardedOrg, getParkingTotals } from '@/lib/parking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The running parking total, for the QR page to poll.
 *
 * Public, and deliberately the narrowest thing that can be public. It returns
 * four numbers and one name. No payer, no row, no id, nothing that says who
 * paid or when: a page taped to a post in a parking lot is a page anybody can
 * open, so this answers the only question a driver asks and no other.
 *
 * Cached for ten seconds at the edge on top of the page's own fifteen second
 * poll. A queue of forty cars all watching the same number should not be forty
 * database reads every fifteen seconds, and a total that is ten seconds stale
 * is indistinguishable from a live one to somebody in a car.
 */
export async function GET() {
  const event = await currentParkingEvent();

  if (!event) {
    return NextResponse.json(
      { ok: true, event: null, cents: 0, vehicles: 0, shareCents: 0, org: null },
      { headers: { 'Cache-Control': 'public, max-age=10' } }
    );
  }

  const [totals, org] = await Promise.all([
    getParkingTotals(event.slug),
    getAwardedOrg(event.slug),
  ]);

  return NextResponse.json(
    {
      ok: true,
      event: event.slug,
      cents: totals.cents,
      vehicles: totals.vehicles,
      shareCents: totals.shareCents,
      /* The name only. The organization's contact details, its application and
         its id are none of a passing driver's business. */
      org: org ? org.name : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=10' } }
  );
}
