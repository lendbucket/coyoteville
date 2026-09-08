import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getEventBySlug } from '@/lib/events-source';
import { getWaiverVersion } from '@/lib/volunteer-waiver/registry';
import {
  eventLabel,
  getSignedWaiversForEvent,
  orgNamesFor,
  signedAtLabel,
  waiverFileName,
  type SignedWaiverRow,
} from '@/lib/volunteer-waiver/record';
import { renderWaiverPdf } from '@/lib/volunteer-waiver/pdf';
import { VOLUNTEER_MINIMUM } from '@/lib/parking-fundraiser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Rendering is the slow part and the default function timeout is not generous.
   A busy night is a couple of dozen waivers, not thousands. */
export const maxDuration = 300;

/**
 * Every signed waiver for one game night, zipped.
 *
 * Per event, and that is the whole point: a waiver is for one night, so "every
 * waiver from that game" is the question anybody actually asks, whether it is
 * an insurer, a lawyer, or Robert checking who worked.
 *
 * The manifest counts adults and minors separately and states the adult
 * minimum, because that is the number the forfeit rule in the program terms
 * turns on. A folder of PDFs a year from now does not answer whether the
 * organization brought six adults; the manifest next to them does.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get('event') ?? '';
  const event = await getEventBySlug(slug);
  if (!event) {
    return new NextResponse('Unknown event.', { status: 404 });
  }

  const rows = await getSignedWaiversForEvent(event.slug);
  if (!rows.length) {
    return new NextResponse('No waivers signed for that game.', { status: 404 });
  }

  const [eventName, orgNames] = await Promise.all([eventLabel(event.slug), orgNamesFor(rows)]);

  const zip = new JSZip();
  const used = new Map<string, number>();
  const included: string[] = [];
  const skipped: string[] = [];
  let adults = 0;
  let minors = 0;

  for (const row of rows) {
    const waiver = getWaiverVersion(row.waiver_version);
    if (!waiver) {
      skipped.push(
        `${row.full_name} — stamped ${row.waiver_version}, no text on file for that version`
      );
      continue;
    }

    const orgName = row.org_application_id ? (orgNames[row.org_application_id] ?? null) : null;

    try {
      const pdf = await renderWaiverPdf(row, waiver, eventName, orgName);
      zip.file(uniqueName(waiverFileName(row), used), pdf);
      included.push(manifestLine(row, orgName, waiver.version));
      if (row.is_adult) adults += 1;
      else minors += 1;
    } catch (err) {
      console.error('volunteer waiver pdf failed in bulk export', row.id, err);
      skipped.push(`${row.full_name} — failed to render`);
    }
  }

  if (!included.length) {
    return new NextResponse('None of those waivers could be produced.', { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  zip.file('manifest.txt', manifest(eventName, stamp, adults, minors, included, skipped));

  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const fileSlug = event.slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="coyoteville-${fileSlug}-waivers-${stamp}.zip"`,
      'Content-Length': String(archive.length),
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Two volunteers can share a name and a night. Neither file is dropped. */
function uniqueName(name: string, used: Map<string, number>): string {
  const seen = used.get(name) ?? 0;
  used.set(name, seen + 1);
  if (!seen) return name;
  return name.replace(/\.pdf$/, `-${seen + 1}.pdf`);
}

function manifestLine(row: SignedWaiverRow, orgName: string | null, version: string): string {
  return [
    row.full_name,
    row.is_adult ? 'adult' : 'under 18',
    orgName ?? 'no organization',
    row.phone ?? 'no phone',
    `signed ${signedAtLabel(row.signed_at)}`,
    version,
    waiverFileName(row),
  ].join(' | ');
}

function manifest(
  eventName: string,
  stamp: string,
  adults: number,
  minors: number,
  included: string[],
  skipped: string[]
): string {
  const lines = [
    'Coyoteville signed volunteer waivers',
    `Event: ${eventName}`,
    `Exported: ${stamp}`,
    `Waivers in this archive: ${included.length}`,
    `Adults: ${adults}`,
    `Under 18: ${minors}`,
    `Adult minimum for a game: ${VOLUNTEER_MINIMUM}`,
    adults >= VOLUNTEER_MINIMUM
      ? 'The adult minimum was met.'
      : `The adult minimum was NOT met: ${VOLUNTEER_MINIMUM - adults} short.`,
    '',
    'Each PDF reproduces the version of the volunteer waiver stored on that',
    "volunteer's row, not the version currently on the site, together with the",
    'electronic signature record captured at signing. A volunteer under 18 has',
    'their parent or guardian signature on the same document.',
    '',
    'Volunteer | Age | Organization | Phone | Signed | Version | File',
    ...included,
  ];

  if (skipped.length) {
    lines.push('', `Not included (${skipped.length}):`, ...skipped.map((line) => `  ${line}`));
  }

  return `${lines.join('\r\n')}\r\n`;
}
