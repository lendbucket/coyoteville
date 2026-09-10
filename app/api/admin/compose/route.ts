import fs from 'node:fs';
import path from 'node:path';
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
import { PRICING } from '@/lib/seo';
import { getEventBySlug, getNextEvent } from '@/lib/events-source';

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

/** Where a server side attachment may come from. One directory, no arguments. */
const LIBRARY_DIR = 'public/photos';

/** A bare filename in that directory. No slashes, no dots leading anywhere. */
const LIBRARY_NAME = /^[a-z0-9][a-z0-9._-]{0,80}.(png|jpg|jpeg)$/i;

/** Between sends. Enough to stay under a provider's burst limit. */
const SEND_GAP_MS = 220;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  /* A rehearsal. Builds every message and reports what each Resend call would
     carry, without calling Resend and without stamping a single row. */
  const dryRun = String(form.get('dry_run') ?? '') === 'true';

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

  /**
   * Files picked off the server rather than uploaded from a phone.
   *
   * The lot map lives in the repo, so making Robert upload a copy of a file
   * that is already deployed is a round trip over a phone connection for
   * nothing. The name is matched against what is actually in public/photos and
   * nothing else is accepted: no path, no traversal, no directory the caller
   * chooses. An unknown name is refused rather than ignored, because silently
   * sending thirty emails without the attachment somebody asked for is worse
   * than not sending them.
   */
  const picked = String(form.get('library') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const library: { filename: string; content: Buffer; contentType: string }[] = [];

  for (const name of picked) {
    if (!LIBRARY_NAME.test(name)) return bad(`"${name}" is not a file we can attach.`);

    const full = path.join(process.cwd(), LIBRARY_DIR, name);
    if (!fs.existsSync(full)) {
      return bad(
        `${name} is not on the server. It has to be committed and deployed, not just added locally.`,
        404
      );
    }

    library.push({
      filename: name,
      content: fs.readFileSync(full),
      contentType: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
  }

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

  /* Library files go on after the uploads and are not resized. They are ours,
     committed at a size we chose, and running the lot map through an image
     fitter would be re-encoding a file that is already right. */
  attachments = [...attachments, ...library];

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
  const failed: { to: string; name: string; reason: string }[] = [];
  const sentAt = new Date();

  /* What a dry run reports: the exact shape each Resend call would carry.
     Nothing is sent and nothing is logged. */
  const preview: {
    to: string;
    name: string;
    subject: string;
    attachments: string[];
    htmlBytes: number;
  }[] = [];

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const name = target.row?.business_name ?? target.to;
    const event =
      (await getEventBySlug(target.row?.event_slug ?? '')) ?? (await getNextEvent());

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
        eventDate: event?.displayDate ?? '',
      }),
    });

    if (dryRun) {
      preview.push({
        to: target.to,
        name,
        subject: message.subject,
        attachments: attachmentNames,
        htmlBytes: message.html.length,
      });
      continue;
    }

    const ok = await sendReminderEmail(target.to, message, attachments);

    if (ok) sent.push(target.to);
    else failed.push({ to: target.to, name, reason: 'The email provider rejected it.' });

    /* A short pause between sends. Thirty messages with an image attached, back
       to back, is the shape a provider rate limits, and one 429 in the middle
       of a batch is a vendor who never hears from us. The invite action paces
       itself for the same reason. Skipped after the last one, which has nothing
       left to be polite to. */
    if (i < targets.length - 1) await sleep(SEND_GAP_MS);
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      recipients: preview.length,
      /* One entry per recipient, each with exactly one address. That is the
         claim this mode exists to make checkable: there is no combined
         payload anywhere, so no address can appear in anybody else's copy. */
      preview,
    });
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
