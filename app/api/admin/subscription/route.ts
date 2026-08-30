import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { cancelAtPeriodEnd, mapSubscriptionStatus } from '@/lib/subscriptions';
import { formatDayLong, isDayKey } from '@/lib/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancel a permanent monthly spot.
 *
 * Always at the end of the paid period, never mid period, and no part month is
 * refunded. That is the rule the agreement states and it is enforced here by
 * having no other option: Square's cancel endpoint stops the next renewal and
 * leaves the current period running, which is exactly the behaviour wanted, so
 * there is no code path that could take the spot away early even by mistake.
 *
 * The row is not marked cancelled outright. It records that a cancellation is
 * booked and keeps holding its space until Square reports the subscription
 * actually finished, because until the paid-through date the vendor is still
 * setting up and the spot is genuinely not free.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Database is not connected.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? '');

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Bad application id.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('vendor_applications')
    .select('id, booking_kind, square_subscription_id, subscription_status, subscription_period_end, subscription_cancel_at_period_end')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'That application does not exist.' }, { status: 404 });
  }

  if (data.booking_kind !== 'monthly') {
    return NextResponse.json(
      { ok: false, error: 'That is not a monthly spot, so there is nothing to cancel.' },
      { status: 400 }
    );
  }

  if (data.subscription_cancel_at_period_end) {
    return NextResponse.json(
      {
        ok: false,
        error: `That spot is already cancelled and runs until ${
          isDayKey(data.subscription_period_end ?? '')
            ? formatDayLong(data.subscription_period_end as string)
            : 'the end of the paid period'
        }.`,
      },
      { status: 409 }
    );
  }

  if (!data.square_subscription_id) {
    /* Approved but never billed, or denied before billing started. There is no
       Square subscription to stop, so this is just a local state change. */
    await supabase
      .from('vendor_applications')
      .update({
        subscription_status: 'canceled',
        subscription_cancel_at_period_end: true,
        subscription_canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      status: 'canceled',
      periodEnd: null,
      note: 'No Square subscription had been started, so nothing was billing.',
    });
  }

  const outcome = await cancelAtPeriodEnd(data.square_subscription_id);

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 502 });
  }

  const periodEnd = outcome.value.chargedThroughDate ?? data.subscription_period_end ?? null;

  const { error: writeError } = await supabase
    .from('vendor_applications')
    .update({
      subscription_cancel_at_period_end: true,
      subscription_canceled_at: new Date().toISOString(),
      // Square's own status. It reports CANCELED as soon as the cancellation is
      // booked, with the subscription still running to the paid-through date,
      // which is why the spot is released off the period end rather than off
      // this field alone.
      subscription_status: mapSubscriptionStatus(outcome.value.status),
      ...(periodEnd ? { subscription_period_end: periodEnd } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (writeError) {
    console.error('subscription cancelled at Square but not recorded', id, writeError);
    return NextResponse.json(
      {
        ok: false,
        error: 'Square cancelled it but the change could not be saved here. Refresh and check.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: mapSubscriptionStatus(outcome.value.status),
    periodEnd,
  });
}
