import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getAdminView, normaliseFilters } from '@/lib/admin-data';
import { dollarsRaw, type RevenueSummary } from '@/lib/revenue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 4180 quoting: wrap in quotes, double any quote inside. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

const HEADERS = [
  'Business',
  'Contact',
  'Phone',
  'Email',
  'Spot type',
  'Sells',
  'Serves food',
  'Payment status',
  'Payment method',
  'Amount',
  'Amount received',
  'Approval',
  'Spot number',
  'Agreement signed',
  'Signature name',
  'Signed at',
  'Agreement version',
  'Permit uploaded',
  'Logo uploaded',
  'Photos',
  'Upload issues',
  'Applied at',
];

/**
 * Revenue block that leads the file.
 *
 * Three columns so it lines up under the row headers rather than sprawling:
 * a line label, a count where one applies, and the amount. Amounts are written
 * unformatted, "1250.00", so a spreadsheet reads them as numbers.
 *
 * These figures cover the whole event, not the filtered rows underneath, which
 * the heading says out loud so nobody reconciles the two and finds a gap.
 */
function summaryLines(revenue: RevenueSummary | null, eventSlug: string): string[][] {
  if (!revenue) return [['Revenue summary', '', 'unavailable']];

  const { collected, bySource, outstanding, projected } = revenue;

  const rows: string[][] = [
    [`Revenue summary (whole event: ${eventSlug})`, '', ''],
    ['Line', 'Count', 'Amount'],
    ['Collected total', '', dollarsRaw(collected.cents)],
    ['Collected, food trucks', String(collected.truck.count), dollarsRaw(collected.truck.cents)],
    ['Collected, vendor booths', String(collected.booth.count), dollarsRaw(collected.booth.cents)],
    ['Collected, Alice orgs', String(collected.free.count), dollarsRaw(collected.free.cents)],
    ['Collected via Square', String(bySource.square.count), dollarsRaw(bySource.square.cents)],
    ['Collected prepaid', String(bySource.prepaid.count), dollarsRaw(bySource.prepaid.cents)],
    ['Outstanding, unpaid with a Square order', String(outstanding.count), dollarsRaw(outstanding.cents)],
  ];

  if (projected.cents === null) {
    rows.push(['Projected at full capacity', '', 'no capacity set']);
  } else {
    rows.push([
      projected.complete
        ? 'Projected at full capacity'
        : 'Projected at full capacity (partial: one side has no capacity set)',
      '',
      dollarsRaw(projected.cents),
    ]);
    if (projected.gapCents !== null) {
      rows.push(['Gap to a full lot', '', dollarsRaw(projected.gapCents)]);
    }
  }

  return rows;
}

/** CSV of the current filtered view. */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    params[k] = v;
  });

  const filters = normaliseFilters(params);
  const view = await getAdminView(filters);

  if (!view.available) {
    return new NextResponse('Could not read applications.', { status: 503 });
  }

  // Summary first, then a blank line, then the rows. Leading it means the
  // numbers are on screen the moment the file opens, without scrolling past
  // every application to find them.
  const lines = summaryLines(view.revenue, filters.event).map((row) => row.map(cell).join(','));
  lines.push('');
  lines.push(HEADERS.map(cell).join(','));

  for (const r of view.rows) {
    lines.push(
      [
        r.business_name,
        r.contact_name,
        r.phone,
        r.email,
        r.spot_type,
        r.sells,
        r.serves_food ? 'yes' : 'no',
        r.payment_status,
        r.payment_method ?? '',
        (r.amount_cents / 100).toFixed(2),
        // Blank, not zero. Nothing recorded is a different fact from nothing
        // received, and a spreadsheet summing this column must not conflate them.
        r.amount_received_cents === null ? '' : (r.amount_received_cents / 100).toFixed(2),
        r.approval_status,
        r.spot_number ?? '',
        r.waiver_accepted ? 'yes' : 'no',
        r.signature_name,
        r.signed_at ?? '',
        r.agreement_version ?? '',
        r.permit_path ? 'yes' : 'no',
        r.logo_path ? 'yes' : 'no',
        r.photo_paths?.length ?? 0,
        r.upload_issues ?? '',
        r.created_at,
      ]
        .map(cell)
        .join(',')
    );
  }

  // Excel opens UTF-8 correctly only when it sees a byte order mark.
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="coyoteville-${filters.event}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
