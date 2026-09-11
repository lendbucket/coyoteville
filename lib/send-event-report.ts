import 'server-only';
import { buildEventReport, reportCsv, REPORT_TO } from './event-report';
import { renderEventReport } from './email/event-report';
import { sendReminderEmail } from './notify';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';

/**
 * Build the report, send it, and record that it went.
 *
 * One function, two callers: the cron and the button in the tracker. The stamp
 * is written only after Resend accepts the message, so a send that failed is
 * one the cron will try again in fifteen minutes rather than one that is
 * silently marked done.
 *
 * `force` is the button. It sends regardless of report_sent_at, because the
 * reason somebody presses it is that the first one did not arrive.
 */
export async function sendEventReport(
  eventSlug: string,
  options: { force?: boolean } = {}
): Promise<{ ok: boolean; sent: boolean; reason?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, sent: false, reason: 'no database' };

  const report = await buildEventReport(eventSlug);
  if (!report) return { ok: false, sent: false, reason: 'no such event' };

  const message = renderEventReport(report);

  const sent = await sendReminderEmail(REPORT_TO, message, [
    {
      filename: `parking-${eventSlug}.csv`,
      content: Buffer.from(reportCsv(report), 'utf8'),
      contentType: 'text/csv',
    },
  ]);

  if (!sent) return { ok: false, sent: false, reason: 'the email provider refused it' };

  /* Stamped after the send. If this update fails the report has still gone and
     the worst case is a second copy on the next run, which is a far better
     failure than a report nobody gets. */
  const { error } = await getSupabaseAdmin()
    .from('events')
    .update({ report_sent_at: new Date().toISOString() })
    .eq('slug', eventSlug);

  if (error) console.error('report sent but report_sent_at was not written', eventSlug, error);

  return { ok: true, sent: true };
}

/**
 * The one event that is over and has not had its report.
 *
 * Oldest first, so a night that was missed is caught up before a newer one. One
 * per run, which is what keeps a backlog from turning into a burst of mail.
 */
export async function nextEventNeedingReport(
  now: number = Date.now()
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('events')
      .select('slug, ends_at, report_sent_at')
      .is('report_sent_at', null)
      .lt('ends_at', new Date(now).toISOString())
      .order('ends_at', { ascending: true })
      .limit(1);

    if (error) throw error;

    const row = (data ?? [])[0] as { slug: string } | undefined;
    return row?.slug ?? null;
  } catch (err) {
    console.error('could not look for an event needing a report', err);
    return null;
  }
}
