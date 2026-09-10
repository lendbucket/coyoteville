import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getEventBySlug } from '@/lib/events-source';
import { HEALTHCHECK_BUSINESS_NAME } from '@/lib/healthcheck';
import { lastStampFrom, stampNote } from '@/lib/abandoned';
import { renderSpotAssignment } from '@/lib/email/spot-assignment';
import { sendReminderEmail } from '@/lib/notify';
import { supportEmail } from '@/lib/support';
import {
  LOT_MAP_FILENAME,
  LOT_MAP_PATH,
  SPOT_ASSIGNMENTS,
  SPOT_EVENT_SLUG,
  normaliseName,
} from '@/lib/spot-assignments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Thirty emails with an image attached, one at a time. Not fast. */
export const maxDuration = 300;

/** Setup has opened at eight on a Friday since the first event. */
const SETUP_TIME = '8:00 AM';

/** Stamped in admin_notes so one vendor cannot be told twice. */
const SPOT_SENT_MARKER = 'Spot assignment sent';

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

type Row = {
  id: string;
  business_name: string;
  email: string;
  spot_number: string | null;
  admin_notes: string | null;
  approval_status: string;
};

/**
 * Every approved row for the night, which is the only set either action reads.
 *
 * Approved, because an unapproved vendor has no spot to be given and a denied
 * one must never be sent a lot map. Health check rows are excluded the way they
 * are everywhere, enforced by check-schema.
 */
async function approvedRows(): Promise<Row[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('vendor_applications')
    .select('id, business_name, email, spot_number, admin_notes, approval_status')
    .neq('business_name', HEALTHCHECK_BUSINESS_NAME)
    .eq('event_slug', SPOT_EVENT_SLUG)
    .eq('approval_status', 'approved');

  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

/**
 * Assigning spots, and sending them. Two actions because they are two
 * decisions: Robert wants to see the assignment land and the misses reported
 * before anything reaches a vendor's inbox.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) return bad('Not signed in.', 401);
  if (!isSupabaseConfigured()) return bad('Database is not connected.', 503);

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = String(body?.action ?? '');
  const supabase = getSupabaseAdmin();

  /* -------------------------------------------------------- assign */

  /**
   * Write the lot plan onto the rows.
   *
   * Matched on business_name, folded and trimmed, and nothing else. A name that
   * does not match exactly is reported rather than guessed at: two stalls can
   * have names one apostrophe apart, and a fuzzy match that picked the wrong
   * one would be a wrong spot number nobody noticed until the night.
   *
   * Rerunnable. It writes the same values again, so a name Robert fixes by hand
   * is picked up by the next run without the ones already right being disturbed.
   */
  if (action === 'assign') {
    let rows: Row[];
    try {
      rows = await approvedRows();
    } catch (err) {
      console.error('[spots] could not read approved rows', err);
      return bad('Could not read the vendors for that event.', 500);
    }

    const byName = new Map<string, Row[]>();
    for (const row of rows) {
      const key = normaliseName(row.business_name);
      byName.set(key, [...(byName.get(key) ?? []), row]);
    }

    const assigned: string[] = [];
    const unmatched: string[] = [];
    const ambiguous: string[] = [];
    const failed: string[] = [];

    for (const { name, spot } of SPOT_ASSIGNMENTS) {
      const matches = byName.get(normaliseName(name)) ?? [];

      if (matches.length === 0) {
        unmatched.push(`${spot}: ${name}`);
        continue;
      }
      if (matches.length > 1) {
        /* Two approved rows under one name. Assigning to either would be a
           coin toss, so neither is touched and both are reported. */
        ambiguous.push(`${spot}: ${name} matches ${matches.length} approved rows`);
        continue;
      }

      const { error } = await supabase
        .from('vendor_applications')
        .update({ spot_number: spot, updated_at: new Date().toISOString() })
        .eq('id', matches[0].id);

      if (error) {
        console.error('[spots] could not assign', matches[0].id, error);
        failed.push(`${spot}: ${name}`);
        continue;
      }
      assigned.push(`${spot}: ${matches[0].business_name}`);
    }

    /* Approved rows the plan says nothing about. Not an error, and worth
       knowing: it is a vendor who will turn up expecting somewhere to stand. */
    const planned = new Set(SPOT_ASSIGNMENTS.map((a) => normaliseName(a.name)));
    const notInPlan = rows
      .filter((r) => !planned.has(normaliseName(r.business_name)))
      .map((r) => r.business_name);

    return NextResponse.json({
      ok: true,
      assigned: assigned.length,
      assignedList: assigned,
      unmatched,
      ambiguous,
      failed,
      notInPlan,
      approvedRows: rows.length,
    });
  }

  /* ---------------------------------------------------------- send */

  /**
   * Email every assigned vendor their spot, with the lot map attached.
   *
   * One send per vendor, ever. The stamp in admin_notes is written only after
   * Resend accepted the message, so a failure can be retried and a success
   * cannot be repeated by a second tap or a second person looking at the
   * tracker.
   *
   * The map is read off disk and attached. If it is not there the email still
   * goes and says staff will point them to the spot, because the number is the
   * thing that matters and a missing picture is not a reason to leave thirty
   * vendors not knowing where to park.
   */
  if (action === 'send') {
    let rows: Row[];
    try {
      rows = await approvedRows();
    } catch (err) {
      console.error('[spots] could not read approved rows', err);
      return bad('Could not read the vendors for that event.', 500);
    }

    const event = await getEventBySlug(SPOT_EVENT_SLUG);
    if (!event) return bad('That event is not in the calendar.', 404);

    let map: Buffer | null = null;
    try {
      const full = path.join(process.cwd(), LOT_MAP_PATH);
      if (fs.existsSync(full)) map = fs.readFileSync(full);
    } catch (err) {
      console.error('[spots] could not read the lot map', err);
    }

    const support = supportEmail();
    const sent: string[] = [];
    const already: string[] = [];
    const noSpot: string[] = [];
    const failed: string[] = [];

    for (const row of rows) {
      if (!row.spot_number) {
        noSpot.push(row.business_name);
        continue;
      }
      if (lastStampFrom(row.admin_notes, SPOT_SENT_MARKER)) {
        already.push(row.business_name);
        continue;
      }

      const message = renderSpotAssignment({
        businessName: row.business_name,
        spot: row.spot_number,
        eventName: event.name,
        eventDate: event.displayDate,
        openTime: event.displayTime,
        setupTime: SETUP_TIME,
        hasMap: Boolean(map),
        supportEmail: support,
      });

      const ok = await sendReminderEmail(
        row.email,
        message,
        map ? [{ filename: LOT_MAP_FILENAME, content: map, contentType: 'image/png' }] : []
      );

      if (!ok) {
        failed.push(row.business_name);
        continue;
      }

      /* Only after it actually went. Appended, so the row keeps its history. */
      const note = [row.admin_notes, stampNote(SPOT_SENT_MARKER)].filter(Boolean).join(' · ');
      const { error } = await supabase
        .from('vendor_applications')
        .update({ admin_notes: note, updated_at: new Date().toISOString() })
        .eq('id', row.id);

      if (error) console.error('[spots] sent but not logged', row.id, error);
      sent.push(row.business_name);
    }

    return NextResponse.json({
      ok: true,
      sent: sent.length,
      sentList: sent,
      already,
      noSpot,
      failed,
      mapAttached: Boolean(map),
    });
  }

  return bad('Unknown action.');
}
