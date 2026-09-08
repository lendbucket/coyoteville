import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getWaiverVersion } from '@/lib/volunteer-waiver/registry';
import {
  eventLabel,
  getSignedWaiver,
  orgNamesFor,
  waiverFileName,
} from '@/lib/volunteer-waiver/record';
import { renderWaiverPdf } from '@/lib/volunteer-waiver/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One volunteer's signed waiver, as a PDF.
 *
 * Admin only, and unlike the organization's terms there is no token link. A
 * waiver carries a date of birth, an emergency contact and, for a minor, a
 * parent's name and phone number. That is not a document to put behind a URL
 * that could be forwarded, and nobody has asked for volunteers to receive their
 * own copy by mail. If that changes it is a token like the organization one,
 * added deliberately.
 *
 * Which text is rendered comes off waiver_version on the row, never from the
 * caller, so this can only ever produce the version that volunteer saw.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Bad id.', { status: 400 });
  }

  const row = await getSignedWaiver(id);
  if (!row) {
    return new NextResponse('No such waiver.', { status: 404 });
  }

  const waiver = getWaiverVersion(row.waiver_version);
  if (!waiver) {
    return new NextResponse(
      `That waiver is stamped ${row.waiver_version}, which this site has no text for. The PDF was not produced rather than render a different waiver than the one that was signed.`,
      { status: 409 }
    );
  }

  try {
    const [eventName, orgNames] = await Promise.all([eventLabel(row.event_slug), orgNamesFor([row])]);
    const orgName = row.org_application_id ? (orgNames[row.org_application_id] ?? null) : null;

    const pdf = await renderWaiverPdf(row, waiver, eventName, orgName);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${waiverFileName(row)}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('volunteer waiver pdf failed', err);
    return new NextResponse('Could not produce that waiver.', { status: 500 });
  }
}
