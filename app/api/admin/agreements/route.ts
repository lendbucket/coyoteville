import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { normaliseFilters } from '@/lib/admin-data';
import { isEventScope, SCOPE_LABELS } from '@/lib/admin-scope';
import { EVENTS } from '@/lib/seo';
import { getAgreementVersion } from '@/lib/agreement/registry';
import {
  agreementFileName,
  bookingLabel,
  getSignedAgreementsForScope,
  signedAtLabel,
  type SignedAgreementRow,
} from '@/lib/agreement/record';
import { renderAgreementPdf } from '@/lib/agreement/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* One event's worth of PDFs is tens of documents, not thousands, but rendering
   is the slow part and the default function timeout is not generous. */
export const maxDuration = 300;

/**
 * Every signed agreement for one scope, zipped.
 *
 * The scope is the same one the tracker is looking at, so this archives an
 * event, the daily bookings, or the monthly vendors, whichever is on screen.
 * Rows nobody signed are not in the archive; rows stamped with a version this
 * site has no text for are listed in the manifest as skipped rather than
 * rendered under some other version's terms.
 *
 * The manifest is not decoration. A folder of PDFs a year from now does not say
 * what it was meant to contain, and "everything that was signed" is only a
 * useful claim if the exceptions are written down next to it.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  // Reuses the tracker's own scope validation, so an unknown slug falls back to
  // the first event rather than quietly matching nothing.
  const { event: scope } = normaliseFilters(params);

  const rows = await getSignedAgreementsForScope(scope);
  if (!rows.length) {
    return new NextResponse('No signed agreements in that view.', { status: 404 });
  }

  const scopeName = isEventScope(scope)
    ? (EVENTS.find((e) => e.slug === scope)?.name ?? scope)
    : SCOPE_LABELS[scope];

  const zip = new JSZip();
  const used = new Map<string, number>();
  const included: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const record = getAgreementVersion(row.agreement_version);
    if (!record) {
      skipped.push(
        `${row.business_name} — stamped ${row.agreement_version ?? 'no version'}, no text on file for that version`
      );
      continue;
    }

    try {
      const pdf = await renderAgreementPdf(row, record);
      zip.file(uniqueName(agreementFileName(row), used), pdf);
      included.push(manifestLine(row, record.version));
    } catch (err) {
      console.error('agreement pdf failed in bulk export', row.id, err);
      skipped.push(`${row.business_name} — failed to render`);
    }
  }

  if (!included.length) {
    return new NextResponse('None of those agreements could be produced.', { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  zip.file('manifest.txt', manifest(scopeName, stamp, included, skipped));

  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const slug = scope.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="coyoteville-${slug}-agreements-${stamp}.zip"`,
      'Content-Length': String(archive.length),
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Two vendors can share a name and a signing date. Neither file is dropped. */
function uniqueName(name: string, used: Map<string, number>): string {
  const seen = used.get(name) ?? 0;
  used.set(name, seen + 1);
  if (!seen) return name;
  return name.replace(/\.pdf$/, `-${seen + 1}.pdf`);
}

function manifestLine(row: SignedAgreementRow, version: string): string {
  return [
    row.business_name,
    row.contact_name,
    bookingLabel(row),
    `signed ${signedAtLabel(row.signed_at)}`,
    version,
    agreementFileName(row),
  ].join(' | ');
}

function manifest(scopeName: string, stamp: string, included: string[], skipped: string[]): string {
  const lines = [
    'Coyoteville signed vendor agreements',
    `Scope: ${scopeName}`,
    `Exported: ${stamp}`,
    `Agreements in this archive: ${included.length}`,
    '',
    'Each PDF reproduces the version of the Vendor Participation Agreement stored on',
    'that vendor’s row, not the version currently on the site, together with the',
    'electronic signature record captured at signing.',
    '',
    'Business | Contact | Booking | Signed | Version | File',
    ...included,
  ];

  if (skipped.length) {
    lines.push(
      '',
      `Not included (${skipped.length}):`,
      ...skipped.map((line) => `  ${line}`)
    );
  }

  return `${lines.join('\r\n')}\r\n`;
}
