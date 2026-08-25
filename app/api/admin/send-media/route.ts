import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { EVENTS } from '@/lib/seo';
import { renderVendorMediaEmail } from '@/lib/email/vendor-media';
import { sendMediaEmail } from '@/lib/notify';
import {
  MEDIA_COLUMNS,
  collectVendorMedia,
  lastMediaSendFrom,
  mediaSendNote,
  packBatch,
  packSingle,
  totalBytes,
  type VendorMedia,
  type VendorRow,
} from '@/lib/media-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Downloading, re-encoding and mailing a whole event's photos takes real time.
 * Stated rather than left to the platform default so a change in that default
 * cannot start cutting a batch off half way through.
 */
export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

type Body = {
  /** One application. Omitted when sending the whole event. */
  id?: string;
  /** Set with `all` to pick the event being sent. */
  event?: string;
  all?: boolean;
  to?: string;
  note?: string;
};

/**
 * Send a vendor's logo and photos, or the whole event's, to any address.
 *
 * Everything is read server side with the service role and attached to the
 * message. No public URL is created and no signed URL is put in the mail.
 *
 * Permits are never included. That is enforced in collectVendorMedia, which
 * only ever reads the logo and photo columns out of the media bucket and
 * throws if a permit path reaches it.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return bad('Database is not connected.', 503);
  }

  const body = (await request.json().catch(() => null)) as Body | null;

  const to = String(body?.to ?? '').trim();
  const note = String(body?.note ?? '').trim().slice(0, 2000);

  // Any address, typed fresh. There is deliberately no allowed list: the whole
  // point is handing files to whoever is doing the posting this week.
  if (!EMAIL_RE.test(to) || to.length > 180) {
    return bad('That email address does not look right.');
  }

  const supabase = getSupabaseAdmin();

  /* ------------------------------------------------ which rows to send */

  let rows: (VendorRow & { admin_notes: string | null })[] = [];

  if (body?.all) {
    const eventSlug = EVENTS.some((e) => e.slug === body.event)
      ? (body.event as string)
      : EVENTS[0].slug;

    const { data, error } = await supabase
      .from('vendor_applications')
      .select(MEDIA_COLUMNS)
      .eq('event_slug', eventSlug)
      .order('business_name', { ascending: true });

    if (error) {
      console.error('[send-media] could not read applications', error);
      return bad('Could not read the applications.', 503);
    }

    rows = ((data ?? []) as unknown as (VendorRow & { admin_notes: string | null })[]).filter(
      (r) => r.logo_path || (r.photo_paths ?? []).length
    );

    if (!rows.length) return bad('No vendor on this event has uploaded a logo or photos yet.', 409);
  } else {
    const id = String(body?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Bad application id.');

    const { data, error } = await supabase
      .from('vendor_applications')
      .select(MEDIA_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return bad('Application not found.', 404);

    const row = data as unknown as VendorRow & { admin_notes: string | null };
    if (!row.logo_path && !(row.photo_paths ?? []).length) {
      return bad('That vendor has no logo or photos to send.', 409);
    }

    rows = [row];
  }

  /* ----------------------------------------------- fetch and fit files */

  let collected: VendorMedia[];
  try {
    collected = await Promise.all(rows.map((r) => collectVendorMedia(r)));
  } catch (err) {
    console.error('[send-media] collection failed', err);
    return bad('Could not read the files from storage. Nothing was sent.', 502);
  }

  const withFiles = collected.filter((v) => v.attachments.length > 0);
  if (!withFiles.length) {
    return bad('None of those files could be read from storage. Nothing was sent.', 502);
  }

  const packed = body?.all ? await packBatch(withFiles) : await packSingle(withFiles[0]);

  if (!packed.batches.length) {
    return bad('There was nothing to send.', 409);
  }

  /* ------------------------------------------------------------- send */

  // For a batch this is the event that was filtered on. For a single vendor it
  // is whatever event that vendor actually applied to, which is not necessarily
  // the one currently selected in the tracker.
  const eventSlug = rows[0]?.event_slug;
  const event = EVENTS.find((e) => e.slug === eventSlug) ?? EVENTS[0];

  const totalParts = packed.batches.length;
  const sentRowIds = new Set<string>();
  let partsSent = 0;

  for (const [i, batch] of packed.batches.entries()) {
    const message = renderVendorMediaEmail({
      vendors: batch.vendors,
      note,
      eventName: event.name,
      eventDate: event.displayDate,
      eventDateISO: event.date,
      downscaled: packed.downscaled,
      part: i + 1,
      totalParts,
    });

    const attachments = batch.vendors.flatMap((v) => v.attachments);
    const result = await sendMediaEmail(to, message, attachments);

    if (!result.ok) {
      // Stop here rather than carrying on. Whatever already went out is logged
      // below, so the trail matches what was actually delivered.
      if (partsSent === 0) {
        return bad(result.error ?? 'The email could not be sent. Nothing was logged.', 502);
      }
      break;
    }

    partsSent += 1;
    batch.vendors.forEach((v) => sentRowIds.add(v.id));
  }

  /* -------------------------------------------------- log what went out */

  const stamp = mediaSendNote(to);
  const sentAt = new Date().toISOString();

  // Logged only for rows that actually made it into a delivered email, and
  // appended so the row keeps its whole history.
  await Promise.all(
    rows
      .filter((r) => sentRowIds.has(r.id))
      .map(async (r) => {
        const notes = [r.admin_notes, stamp].filter(Boolean).join(' · ');
        const { error } = await supabase
          .from('vendor_applications')
          .update({ admin_notes: notes, updated_at: sentAt })
          .eq('id', r.id);
        if (error) console.error('[send-media] sent but not logged', r.id, error);
      })
  );

  return NextResponse.json({
    ok: true,
    to,
    parts: partsSent,
    totalParts,
    vendors: sentRowIds.size,
    files: packed.batches
      .slice(0, partsSent)
      .reduce((n, b) => n + b.vendors.reduce((m, v) => m + v.attachments.length, 0), 0),
    bytes: totalBytes(packed.batches.slice(0, partsSent).flatMap((b) => b.vendors)),
    downscaled: packed.downscaled,
    lastSend: lastMediaSendFrom(stamp),
  });
}
