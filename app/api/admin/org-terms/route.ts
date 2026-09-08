import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getTermsVersion } from '@/lib/fundraiser-terms/registry';
import { getSignedOrgTerms, orgTermsFileName } from '@/lib/org-terms/record';
import { renderOrgTermsPdf } from '@/lib/org-terms/pdf';
import { ORG_TERMS_PURPOSE, verifyDocumentToken } from '@/lib/doc-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One organization's signed program terms, as a PDF.
 *
 * Two ways in, and they are not the same permission.
 *
 * An admin session reaches any organization's document, which is what the
 * tracker's download button uses. A token in the query string reaches exactly
 * the one document it was minted for, which is what the confirmation email
 * carries so the organization has its own copy without an account. Neither
 * path lets the caller choose which text is rendered: that comes off
 * terms_version on the row.
 *
 * The token is checked against the id from the same URL, so editing the id
 * invalidates it rather than walking to the next organization's row.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Bad id.', { status: 400 });
  }

  const authorised =
    verifyDocumentToken(ORG_TERMS_PURPOSE, id, url.searchParams.get('t')) ||
    (await isAdminRequest());

  if (!authorised) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const row = await getSignedOrgTerms(id);
  if (!row) {
    return new NextResponse('No such application.', { status: 404 });
  }

  if (!row.terms_accepted || !row.signature_name) {
    return new NextResponse('That organization has not signed the program terms.', { status: 409 });
  }

  /* An unknown version string is refused rather than served under the current
     text. The program was renamed once, which changed the wording inside
     several clauses, so this is not hypothetical: a document that looks
     authoritative and states different terms than were agreed is worse than no
     document at all. */
  const terms = getTermsVersion(row.terms_version);
  if (!terms) {
    return new NextResponse(
      `That row is stamped with terms version ${row.terms_version ?? 'none'}, which this site has no text for. The PDF was not produced rather than render different terms than the organization signed.`,
      { status: 409 }
    );
  }

  try {
    const pdf = await renderOrgTermsPdf(row, terms);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${orgTermsFileName(row)}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('org terms pdf failed', err);
    return new NextResponse('Could not produce those terms.', { status: 500 });
  }
}
