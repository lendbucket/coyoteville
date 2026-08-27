import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';
import { sendReminderEmail } from '@/lib/notify';
import { renderComposeEmail } from '@/lib/email/compose';
import { contextFrom } from '@/lib/email/merge-fields';
import { isEmptyBody, toEmailHtml } from '@/lib/email/rich-text';
import { composeSendNote } from '@/lib/compose-log';
import { fitAttachments, MAX_EMAIL_BYTES } from '@/lib/attachments';
import { EVENTS, PRICING } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send a composed email to one or many recipients.
 *
 * Each recipient gets their own message. Nobody is ever put in the same To
 * line as anyone else, so one vendor cannot see who else was written to and a
 * merge field can resolve differently per person.
 *
 * Two protections against sending the same thing twice, which is the mistake
 * that actually happens with a button like this:
 *
 *   A short rate limit on the admin session, so a double tap or an impatient
 *     second press cannot start a second run while the first is in flight.
 *   A fingerprint of the subject, body and recipient list, remembered briefly,
 *     so re-submitting an identical draft inside the window is refused with an
 *     explanation rather than quietly doubling up.
 *
 * The body is re-sanitised here. The composer sanitises for its preview, but
 * this route never trusts what arrived over the wire.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_RECIPIENTS = 60;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function spotLabel(spot: string | null): string {
  if (spot === 'truck') return PRICING.truck.label;
  if (spot === 'booth') return PRICING.booth.label;
  if (spot === 'free') return PRICING.free.label;
  return 'Vendor';
}

/**
 * Recently sent fingerprints, so an identical draft cannot go out twice.
 * In process and short lived on purpose: this guards against a double tap and
 * a refresh, not against someone deliberately re-sending an hour later.
 */
const recent = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

function seenRecently(key: string): boolean {
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > DUPLICATE_WINDOW_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

type VendorRow = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  spot_type: string;
  spot_number: string | null;
  event_slug: string;
  admin_notes: string | null;
};

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return bad('Not signed in.', 401);

  // One admin, one session. Keyed to the route rather than to an IP, because
  // the tracker is used from a phone that changes networks.
  const limit = rateLimit('admin:compose', 6, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Slow down a moment. Try again in ${limit.retryAfterSeconds} seconds.`,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('We could not read that.');
  }

  const subject = String(form.get('subject') ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const preheaderText = String(form.get('preheader') ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const bodyHtml = String(form.get('body') ?? '').slice(0, 200_000);

  const vendorIds = String(form.get('vendor_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));

  const manual = String(form.get('manual') ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!subject) return bad('Add a subject line.');
  if (isEmptyBody(toEmailHtml(bodyHtml))) return bad('Write something in the body first.');

  const badAddress = manual.find((m) => !EMAIL_RE.test(m) || m.length > 180);
  if (badAddress) return bad(`"${badAddress}" does not look like an email address.`);

  if (!vendorIds.length && !manual.length) return bad('Pick at least one recipient.');
  if (vendorIds.length + manual.length > MAX_RECIPIENTS) {
    return bad(`That is more than ${MAX_RECIPIENTS} recipients in one go.`);
  }

  /* ------------------------------------------------------- attachments */

  const files = form.getAll('attachments').filter((f): f is File => f instanceof File && f.size > 0);

  let attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  let downscaled = false;

  if (files.length) {
    try {
      const fitted = await fitAttachments(files);
      attachments = fitted.attachments;
      downscaled = fitted.downscaled;
      if (fitted.tooBig) {
        return bad(
          `Those files are still over ${Math.round(MAX_EMAIL_BYTES / (1024 * 1024))}MB after resizing. Send fewer at a time.`,
          413
        );
      }
    } catch (err) {
      console.error('[compose] attachment handling failed', err);
      return bad('We could not read those files.', 400);
    }
  }

  /* ---------------------------------------------------------- recipients */

  if (vendorIds.length && !isSupabaseConfigured()) {
    return bad('Database is not connected.', 503);
  }

  let vendors: VendorRow[] = [];

  if (vendorIds.length) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('vendor_applications')
      .select('id, business_name, contact_name, email, spot_type, spot_number, event_slug, admin_notes')
      .in('id', vendorIds);

    if (error) {
      console.error('[compose] could not read vendors', error);
      return bad('Could not read those vendors.', 503);
    }

    vendors = ((data ?? []) as unknown as VendorRow[]).filter((v) => EMAIL_RE.test(v.email ?? ''));
  }

  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        subject,
        preheaderText,
        bodyHtml,
        to: [...vendors.map((v) => v.email), ...manual].sort(),
        files: attachments.map((a) => a.filename + ':' + a.content.length),
      })
    )
    .digest('hex');

  if (seenRecently(fingerprint)) {
    return bad(
      'That exact message just went out. If you meant to send it again, change something or wait a few minutes.',
      409
    );
  }

  /* --------------------------------------------------------------- send */

  const attachmentNames = attachments.map((a) => a.filename);

  type Target = { to: string; row: VendorRow | null };
  const targets: Target[] = [
    ...vendors.map((v) => ({ to: v.email, row: v })),
    ...manual.map((m) => ({ to: m, row: null })),
  ];

  const sent: string[] = [];
  const failed: { to: string; reason: string }[] = [];
  const sentAt = new Date();

  for (const target of targets) {
    const event = EVENTS.find((e) => e.slug === target.row?.event_slug) ?? EVENTS[0];

    const message = renderComposeEmail({
      subject,
      preheaderText,
      bodyHtml,
      attachmentNames,
      context: contextFrom({
        business_name: target.row?.business_name,
        contact_name: target.row?.contact_name,
        spot_number: target.row?.spot_number,
        spotTypeLabel: target.row ? spotLabel(target.row.spot_type) : null,
        eventDate: event.displayDate,
      }),
    });

    const ok = await sendReminderEmail(target.to, message, attachments);

    if (ok) sent.push(target.to);
    else failed.push({ to: target.to, reason: 'The email provider rejected it.' });
  }

  /* ---------------------------------------------------------- the trail */

  if (isSupabaseConfigured() && vendors.length) {
    const supabase = getSupabaseAdmin();
    const stamp = sentAt.toISOString();

    await Promise.all(
      vendors
        .filter((v) => sent.includes(v.email))
        .map(async (v) => {
          const note = composeSendNote(v.email, subject, sentAt);
          const notes = [v.admin_notes, note].filter(Boolean).join(' · ');
          const { error } = await supabase
            .from('vendor_applications')
            .update({ admin_notes: notes, updated_at: stamp })
            .eq('id', v.id);
          if (error) console.error('[compose] sent but not logged', v.id, error);
        })
    );
  }

  const missing = vendorIds.length - vendors.length;

  return NextResponse.json({
    ok: sent.length > 0,
    sent: sent.length,
    failed,
    downscaled,
    // Rows that were selected but had no usable address. Surfaced rather than
    // quietly dropped, because the count would otherwise not add up.
    skipped: missing > 0 ? missing : 0,
    error: sent.length === 0 ? 'Nothing sent. Every address failed.' : undefined,
  });
}
