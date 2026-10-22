import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { RACE_SLUG } from '@/lib/race';
import { awardsCsv, getRaceAdminView, runnersCsv, sponsorsCsv } from '@/lib/race-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The three CSVs.
 *
 * Built in lib/race-admin rather than here, so the headers are one list that
 * check-race-export can read. The runner sheet deliberately has no
 * medical_notes column: it gets printed and left on a table in a parking lot.
 */

const KINDS = {
  runners: { build: runnersCsv, name: 'turkey-trot-runners' },
  awards: { build: awardsCsv, name: 'turkey-trot-age-group-awards' },
  sponsors: { build: sponsorsCsv, name: 'turkey-trot-sponsors' },
} as const;

type Kind = keyof typeof KINDS;

function stamp(): string {
  /* A date in the filename, because three of these end up in one downloads
     folder and the question is always which one is today's. */
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 });
  }

  const kind = new URL(request.url).searchParams.get('kind') ?? '';
  if (!(kind in KINDS)) {
    return NextResponse.json({ ok: false, error: 'Unknown export.' }, { status: 400 });
  }

  const { build, name } = KINDS[kind as Kind];
  const view = await getRaceAdminView(RACE_SLUG);

  /* A BOM, so Excel opens it as UTF-8 instead of mangling a name with an
     accent in it. Every other export on this site does the same. */
  return new NextResponse('﻿' + build(view), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${stamp()}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
