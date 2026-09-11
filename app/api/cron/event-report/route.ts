import { NextResponse } from 'next/server';
import { nextEventNeedingReport, sendEventReport } from '@/lib/send-event-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The end of night report, on a timer.
 *
 * Every fifteen minutes. It looks for an event whose ends_at has passed and
 * whose report_sent_at is still null, sends that one, and stamps the row. One
 * per run: a backlog catches up over the following hour instead of arriving as
 * a burst of mail, and the oldest goes first.
 *
 * Idempotency is the column, not a lock. Two overlapping runs both send at
 * worst one duplicate; a run that crashes after the send stamps nothing and the
 * next run sends again. Both are better than a report nobody gets, which is the
 * failure this exists to prevent.
 *
 * Vercel sends Authorization: Bearer $CRON_SECRET on scheduled invocations. It
 * is verified rather than trusted: this route reads money and emails it, so an
 * unauthenticated caller must not be able to make it run.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  /* No secret configured means no authenticated caller is possible, so the
     route refuses everything rather than running for anyone. */
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  /* Length checked first, then a constant time compare, so a wrong guess does
     not advertise how much of it was right. */
  if (header.length !== expected.length) return false;

  let same = 0;
  for (let i = 0; i < expected.length; i += 1) {
    same |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return same === 0;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const slug = await nextEventNeedingReport();
  if (!slug) return NextResponse.json({ ok: true, sent: false, reason: 'nothing to report' });

  const result = await sendEventReport(slug);

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    eventSlug: slug,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
