import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getEvents } from '@/lib/events-source';
import { DRAWABLE_STATUSES, PROGRAM_NAME, drawOne, payoutFor } from '@/lib/parking-fundraiser';
import { LIVE_PURPOSE, documentToken } from '@/lib/doc-token';
import { renderLiveLink } from '@/lib/email/live-link';
import { sendReminderEmail } from '@/lib/notify';
import { sendSms } from '@/lib/sms';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Parking Fundraiser, from the tracker.
 *
 * Four actions on one route because they are all one job: decide who is in,
 * draw a game, record what came in, publish it.
 *
 *   status   approve or decline an application
 *   pick     draw an organization for a game
 *   payout   record the parking gross, which computes the split
 *   publish  put that game on the public ledger
 */

const UUID = /^[0-9a-f-]{36}$/i;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return bad('Not signed in.', 401);
  if (!isSupabaseConfigured()) return bad('Database is not connected.', 503);

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    id?: string;
    status?: string;
    eventSlug?: string;
    grossCents?: number;
    paidMethod?: string;
    notes?: string;
  } | null;

  const supabase = getSupabaseAdmin();
  const action = String(body?.action ?? '');

  /* ---------------------------------------------------------- status */

  if (action === 'status') {
    const id = String(body?.id ?? '');
    const status = String(body?.status ?? '');
    if (!UUID.test(id)) return bad('Bad application id.');
    if (!['pending', 'selected', 'declined', 'withdrawn'].includes(status)) {
      return bad('That is not a status.');
    }

    const { error } = await supabase
      .from('org_applications')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return bad('Could not update that application.', 500);
    return NextResponse.json({ ok: true });
  }

  /* ------------------------------------------------------------ pick */

  if (action === 'pick' || action === 'pool') {
    const eventSlug = String(body?.eventSlug ?? '');
    const events = await getEvents();
    if (!events.some((e) => e.slug === eventSlug)) return bad('That is not a home game.');

    /* Already awarded. event_slug is unique on the table, so the database would
       refuse a second row anyway; this is the readable version of that. */
    const { data: existing } = await supabase
      .from('org_event_awards')
      .select('event_slug')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    if (existing) return bad('That game already has an organization.', 409);

    /* Everyone who said they could work this game and is still in. */
    const { data: applicants, error } = await supabase
      .from('org_applications')
      .select('id, org_name, event_slugs, status')
      .in('status', DRAWABLE_STATUSES)
      .contains('event_slugs', [eventSlug]);

    if (error) return bad('Could not read the applications.', 500);

    const pool = (applicants ?? []) as { id: string; org_name: string }[];

    /* Fairness: an organization that already has a game is left out until
       everybody has had one, then the pool reopens. Without this the same
       group can win twice while somebody else never works a night, which is
       the fastest way for a random draw to stop looking fair. */
    const { data: awarded } = await supabase
      .from('org_event_awards')
      .select('org_application_id')
      .not('org_application_id', 'is', null);

    const hasGame = new Set(
      ((awarded ?? []) as { org_application_id: string }[]).map((a) => a.org_application_id)
    );

    const fresh = pool.filter((p) => !hasGame.has(p.id));
    const eligible = fresh.length ? fresh : pool;

    if (action === 'pool') {
      return NextResponse.json({
        ok: true,
        count: eligible.length,
        names: eligible.map((e) => e.org_name),
        reopened: fresh.length === 0 && pool.length > 0,
      });
    }

    const winner = drawOne(eligible);
    if (!winner) return bad('Nobody has applied for that game yet.', 409);

    const { error: awardError } = await supabase.from('org_event_awards').insert({
      event_slug: eventSlug,
      org_application_id: winner.id,
      picked_at: new Date().toISOString(),
      /* Recorded so the draw can be audited later. A program that says "picked
         at random" and keeps no record of the pool is asking to be trusted. */
      picked_from_count: eligible.length,
    });

    if (awardError) {
      console.error('[organizations] award insert failed', awardError);
      return bad('Could not record the pick.', 500);
    }

    await supabase
      .from('org_applications')
      .update({ status: 'selected', updated_at: new Date().toISOString() })
      .eq('id', winner.id);

    console.log(
      '[parking-fundraiser] drew',
      JSON.stringify({ eventSlug, winner: winner.org_name, from: eligible.length })
    );

    return NextResponse.json({
      ok: true,
      orgName: winner.org_name,
      pickedFrom: eligible.length,
    });
  }

  /* ---------------------------------------------------------- payout */

  if (action === 'payout') {
    const eventSlug = String(body?.eventSlug ?? '');
    const grossCents = Number(body?.grossCents);

    if (!Number.isFinite(grossCents) || grossCents < 0 || grossCents > 100_000_00) {
      return bad('That parking total does not look right.');
    }

    const { error } = await supabase
      .from('org_event_awards')
      .update({
        parking_gross_cents: Math.round(grossCents),
        /* Computed here rather than stored as a rate, so the number on the
           ledger is the number that was paid and the arithmetic is checkable. */
        payout_cents: payoutFor(Math.round(grossCents)),
        paid_at: body?.paidMethod ? new Date().toISOString() : null,
        paid_method: body?.paidMethod ?? null,
        notes: body?.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('event_slug', eventSlug);

    if (error) return bad('Could not record that.', 500);
    return NextResponse.json({ ok: true, payoutCents: payoutFor(Math.round(grossCents)) });
  }

  /* --------------------------------------------------------- publish */

  if (action === 'publish') {
    const eventSlug = String(body?.eventSlug ?? '');

    const { data: award } = await supabase
      .from('org_event_awards')
      .select('parking_gross_cents, payout_cents')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    if (!award) return bad('That game has no award to publish.', 404);
    if (award.parking_gross_cents === null || award.payout_cents === null) {
      /* The ledger is the argument for the whole program. A row on it with no
         numbers is worse than no row. */
      return bad('Enter the parking total before publishing this one.', 409);
    }

    const { error } = await supabase
      .from('org_event_awards')
      .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('event_slug', eventSlug);

    if (error) return bad('Could not publish that.', 500);
    return NextResponse.json({ ok: true });
  }

  /* ------------------------------------------------------- live-link */

  /**
   * Send the organization the link to their own live page.
   *
   * Email and text, because the contact is a volunteer who will be standing in
   * a stand on a Friday night and email is not where they are looking. The text
   * is the one that gets opened; the email is the one that is still findable on
   * Sunday.
   *
   * Fired by hand from the tracker and never automatically. Robert decides when
   * an organization gets the link, and neither send happens until he taps it.
   *
   * Reports both outcomes separately. A text that failed while the email went
   * is a different situation from neither going, and telling him "sent" when
   * half of it did would be the kind of small lie that costs a night.
   */
  if (action === 'live-link') {
    const id = String(body?.id ?? '');
    if (!UUID.test(id)) return bad('Bad application id.');

    const { data: org } = await supabase
      .from('org_applications')
      .select('id, org_name, contact_name, email, phone')
      .eq('id', id)
      .maybeSingle();

    if (!org) return bad('No such organization.', 404);
    const row = org as {
      org_name: string;
      contact_name: string;
      email: string;
      phone: string | null;
    };

    const token = documentToken(LIVE_PURPOSE, id);
    if (!token) {
      return bad('This deployment cannot sign a link, so nothing was sent.', 503);
    }

    const url = `${SITE_URL}/fundraiser/live?id=${id}&t=${token}`;
    const first = row.contact_name.trim().split(/s+/)[0] || row.contact_name.trim();

    const message = renderLiveLink({
      programName: PROGRAM_NAME,
      orgName: row.org_name,
      contactName: row.contact_name,
      url,
    });

    const emailed = await sendReminderEmail(row.email, message)
      .then(() => true)
      .catch((err) => {
        console.error('[organizations] live link email failed', err);
        return false;
      });

    /* Short, because it is read on a lock screen. The link is the message. */
    const texted = row.phone
      ? await sendSms(
          row.phone,
          `${first}, here is your ${PROGRAM_NAME} page for tonight. It updates as cars pay: ${url}`
        )
      : { ok: false, error: 'No phone number on this organization.' };

    if (!emailed && !texted.ok) {
      return bad(`Nothing was sent. ${texted.error ?? 'The email failed too.'}`, 502);
    }

    return NextResponse.json({
      ok: true,
      emailed,
      texted: texted.ok,
      /* Returned so the tracker can show it and Robert can copy it into a
         message himself if both sends failed. */
      url,
      note: texted.ok ? null : texted.error,
    });
  }

  return bad('Unknown action.');
}
