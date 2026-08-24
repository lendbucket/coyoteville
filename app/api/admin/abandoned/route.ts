import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getAbandoned, howLongAgo, lastReminderFrom, reminderNote } from '@/lib/abandoned';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getSquare, isSquareConfigured } from '@/lib/square';
import { renderReminder } from '@/lib/email/reminder';
import { sendReminderEmail } from '@/lib/notify';
import { supportEmail } from '@/lib/support';
import { EVENTS, SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveEvent(slug: string | null): string {
  return EVENTS.some((e) => e.slug === slug) ? (slug as string) : EVENTS[0].slug;
}

/** Started but not paid, for the current event. */
export async function GET(request: Request) {
  if (!isAdminRequest()) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  const eventSlug = resolveEvent(new URL(request.url).searchParams.get('event'));
  const rows = await getAbandoned(eventSlug);

  return NextResponse.json({
    ok: true,
    eventSlug,
    count: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      business_name: r.business_name,
      contact_name: r.contact_name,
      phone: r.phone,
      email: r.email,
      spot_type: r.spot_type,
      amount_cents: r.amount_cents,
      started: howLongAgo(r.minutesAgo),
      minutesAgo: r.minutesAgo,
      lastReminderAt: r.lastReminderAt,
      canRemind: Boolean(r.square_payment_link_id),
    })),
  });
}

/**
 * Send one vendor a reminder that their spot is not held until they pay.
 *
 * The send is logged into admin_notes with a timestamp, and a row that already
 * carries that note is refused, so the same person cannot be chased twice by a
 * double tap or a second person looking at the tracker.
 */
export async function POST(request: Request) {
  if (!isAdminRequest()) {
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
  const { data: row, error } = await supabase
    .from('vendor_applications')
    .select(
      'id, business_name, email, spot_type, amount_cents, payment_status, admin_notes, square_payment_link_id'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ ok: false, error: 'Application not found.' }, { status: 404 });
  }

  if (row.payment_status !== 'unpaid') {
    return NextResponse.json(
      { ok: false, error: 'That vendor has already paid.' },
      { status: 409 }
    );
  }

  // The vendor's original payment link, looked up by the id stored at checkout.
  // A new link would mean a new order with a different referenceId, and the
  // webhook would settle the payment against the wrong application, so this
  // refuses rather than falling back to a generic link.
  if (!row.square_payment_link_id) {
    return NextResponse.json(
      { ok: false, error: 'No Square payment link on this application, so there is nothing to resend.' },
      { status: 409 }
    );
  }

  if (!isSquareConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Square is not connected, so the payment link cannot be looked up.' },
      { status: 503 }
    );
  }

  let finishUrl: string | null = null;
  try {
    const link = await getSquare().checkout.paymentLinks.get({ id: row.square_payment_link_id });
    finishUrl = link.paymentLink?.url || link.paymentLink?.longUrl || null;
  } catch (err) {
    console.error('could not resolve Square payment link for reminder', row.id, err);
  }

  if (!finishUrl) {
    return NextResponse.json(
      { ok: false, error: 'Could not read the payment link from Square. Nothing was sent.' },
      { status: 502 }
    );
  }

  const message = renderReminder({
    businessName: row.business_name,
    spotType: row.spot_type,
    amountCents: row.amount_cents ?? 0,
    finishUrl,
    supportEmail: supportEmail(),
  });

  const sent = await sendReminderEmail(row.email, message);
  if (!sent) {
    return NextResponse.json(
      { ok: false, error: 'The reminder could not be sent. Nothing was logged.' },
      { status: 502 }
    );
  }

  // Only logged once the send actually succeeded, so a failure can be retried.
  // Appended rather than replaced, so the row keeps the whole history.
  const stamp = reminderNote();
  const note = [row.admin_notes, stamp].filter(Boolean).join(' · ');

  const { error: noteError } = await supabase
    .from('vendor_applications')
    .update({ admin_notes: note, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (noteError) console.error('reminder sent but not logged', id, noteError);

  return NextResponse.json({ ok: true, id, lastReminderAt: lastReminderFrom(stamp) });
}
