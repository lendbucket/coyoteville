import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getAgreementVersion } from '@/lib/agreement/registry';
import { agreementFileName, getSignedAgreement } from '@/lib/agreement/record';
import { renderAgreementPdf } from '@/lib/agreement/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One vendor's signed agreement, as a PDF.
 *
 * Rendered here rather than in the browser so nothing about it is publicly
 * reachable: the row is read with the service role key behind the admin
 * session, and the file only exists for the length of the response.
 *
 * The id comes from the query string but nothing else does. Which text to
 * render is decided by the agreement_version on the row, never by the caller,
 * so there is no request that produces a vendor's agreement under a version
 * they did not sign.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Bad id.', { status: 400 });
  }

  const row = await getSignedAgreement(id);
  if (!row) {
    return new NextResponse('No such application.', { status: 404 });
  }

  if (!row.waiver_accepted || !row.signature_name) {
    return new NextResponse('That vendor has not signed an agreement.', { status: 409 });
  }

  /* An unknown version string is refused rather than served under the current
     text. A document that looks authoritative and states the wrong terms is
     worse than no document at all, and this is the one failure mode that would
     produce one. */
  const record = getAgreementVersion(row.agreement_version);
  if (!record) {
    return new NextResponse(
      `That row is stamped with agreement version ${row.agreement_version ?? 'none'}, which this site has no text for. The PDF was not produced rather than render different terms than the vendor signed.`,
      { status: 409 }
    );
  }

  try {
    const pdf = await renderAgreementPdf(row, record);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${agreementFileName(row)}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('agreement pdf failed', err);
    return new NextResponse('Could not produce that agreement.', { status: 500 });
  }
}
