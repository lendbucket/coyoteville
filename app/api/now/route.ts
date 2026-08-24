import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server clock, for the countdowns.
 *
 * The pages themselves are statically rendered and revalidated on an interval,
 * so the timestamp baked into the HTML can be a little behind. The countdowns
 * call this once on mount to work out how far the visitor's device clock is
 * from ours, and measure against that. It is the reason a laptop set to the
 * wrong date still shows the right number of days left.
 */
export async function GET() {
  return NextResponse.json(
    { now: Date.now() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
