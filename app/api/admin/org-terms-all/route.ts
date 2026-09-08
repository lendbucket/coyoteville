import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getTermsVersion } from '@/lib/fundraiser-terms/registry';
import {
  gameNames,
  getAllSignedOrgTerms,
  orgTermsFileName,
  signedAtLabel,
  statusLabel,
  type SignedOrgRow,
} from '@/lib/org-terms/record';
import { renderOrgTermsPdf } from '@/lib/org-terms/pdf';
import { PROGRAM_NAME } from '@/lib/parking-fundraiser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Rendering is the slow part and the default function timeout is not generous. */
export const maxDuration = 300;

/**
 * Every organization's signed program terms, zipped.
 *
 * Not scoped to an event, unlike the vendor archive. An organization applies
 * once for a season and names the games it can work, so there is no per event
 * slice of this to take: the whole set is the unit.
 *
 * Rows nobody signed are not in the archive. Rows stamped with a version this
 * site has no text for are listed in the manifest as skipped rather than
 * rendered under some other version's terms, which is the one way this could
 * produce a document that looks right and is wrong.
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const rows = await getAllSignedOrgTerms();
  if (!rows.length) {
    return new NextResponse('No organization has signed the program terms yet.', { status: 404 });
  }

  const zip = new JSZip();
  const used = new Map<string, number>();
  const included: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const terms = getTermsVersion(row.terms_version);
    if (!terms) {
      skipped.push(
        `${row.org_name} — stamped ${row.terms_version ?? 'no version'}, no text on file for that version`
      );
      continue;
    }

    try {
      const pdf = await renderOrgTermsPdf(row, terms);
      zip.file(uniqueName(orgTermsFileName(row), used), pdf);
      included.push(await manifestLine(row, terms.version));
    } catch (err) {
      console.error('org terms pdf failed in bulk export', row.id, err);
      skipped.push(`${row.org_name} — failed to render`);
    }
  }

  if (!included.length) {
    return new NextResponse('None of those documents could be produced.', { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  zip.file('manifest.txt', manifest(stamp, included, skipped));

  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="coyoteville-program-terms-${stamp}.zip"`,
      'Content-Length': String(archive.length),
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Two organizations can share a name and a signing date. Neither is dropped. */
function uniqueName(name: string, used: Map<string, number>): string {
  const seen = used.get(name) ?? 0;
  used.set(name, seen + 1);
  if (!seen) return name;
  return name.replace(/\.pdf$/, `-${seen + 1}.pdf`);
}

async function manifestLine(row: SignedOrgRow, version: string): Promise<string> {
  const games = await gameNames(row);
  return [
    row.org_name,
    row.contact_name,
    games.join('; ') || 'no games recorded',
    statusLabel(row),
    `signed ${signedAtLabel(row.signed_at)}`,
    version,
    orgTermsFileName(row),
  ].join(' | ');
}

function manifest(stamp: string, included: string[], skipped: string[]): string {
  const lines = [
    `Coyoteville signed ${PROGRAM_NAME} program terms`,
    `Exported: ${stamp}`,
    `Documents in this archive: ${included.length}`,
    '',
    'Each PDF reproduces the version of the program terms stored on that',
    "organization's row, not the version currently on the site, together with the",
    'electronic signature record captured at signing.',
    '',
    'Organization | Contact | Games | Status | Signed | Version | File',
    ...included,
  ];

  if (skipped.length) {
    lines.push('', `Not included (${skipped.length}):`, ...skipped.map((line) => `  ${line}`));
  }

  return `${lines.join('\r\n')}\r\n`;
}
