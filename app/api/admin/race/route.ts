import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { RACE_SLUG } from '@/lib/race';
import { getRace, getSponsorStanding } from '@/lib/races';
import {
  assignBibs,
  getRaceAdminView,
  setCheckedIn,
  setShirtCollected,
  setSponsorPublished,
} from '@/lib/race-admin';
import { sendRacePaymentLink } from '@/lib/race-payment-resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Race tab's one read and its four writes.
 *
 * Behind the same admin cookie as the rest of the tracker. It returns runners
 * with their emergency contacts and their medical notes, which is the most
 * sensitive thing this site holds, so there is no public shape of this route at
 * all: no slug parameter that could widen it, no unauthenticated branch.
 */

function unauthorised() {
  return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 });
}

export async function GET() {
  if (!(await isAdminRequest())) return unauthorised();

  const [race, view, standing] = await Promise.all([
    getRace(RACE_SLUG),
    getRaceAdminView(RACE_SLUG),
    getSponsorStanding(RACE_SLUG),
  ]);

  return NextResponse.json(
    { ok: true, race, view, standing },
    /* Never a shared cache. This is one race's runners behind one cookie. */
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return unauthorised();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const id = typeof body.id === 'string' ? body.id : '';
  const on = body.on !== false;

  try {
    if (action === 'bibs') {
      const result = await assignBibs(RACE_SLUG);
      return NextResponse.json({ ok: true, ...result });
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Which one?' }, { status: 400 });
    }

    if (action === 'checkin') {
      const at = await setCheckedIn(id, on);
      return NextResponse.json({ ok: true, checkedInAt: at });
    }

    if (action === 'shirt') {
      await setShirtCollected(id, on);
      return NextResponse.json({ ok: true, shirtCollected: on });
    }

    if (action === 'publish-sponsor') {
      const at = await setSponsorPublished(id, on);
      return NextResponse.json({ ok: true, publishedAt: at });
    }

    /* Send a runner the link for the row they already have.
     *
     * Its failures are reported with Square's own words and its own status
     * code rather than falling through to the generic handler below, because
     * "that did not save" is useless when the question is why Square refused.
     * Reporting success for a link that was never created is exactly what hid
     * the original bug from the runner. */
    if (action === 'pay-link') {
      const race = await getRace(RACE_SLUG);
      if (!race) {
        return NextResponse.json(
          { ok: false, error: 'The race row could not be read, so no link can be built.' },
          { status: 503 }
        );
      }

      const result = await sendRacePaymentLink(id, race);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
      }

      return NextResponse.json({
        ok: true,
        sentTo: result.sentTo,
        sentAt: result.sentAt,
        amountCents: result.amountCents,
        grouped: result.grouped,
      });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('race tracker write failed', action, err);
    return NextResponse.json(
      { ok: false, error: 'That did not save. Try again.' },
      { status: 500 }
    );
  }
}
