import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getAdminView, normaliseFilters } from '@/lib/admin-data';

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
  'Amount',
  'Approval',
  'Spot number',
  'Agreement signed',
  'Signature name',
  'Signed at',
  'Agreement version',
  'Permit uploaded',
  'Logo uploaded',
  'Photos',
  'Applied at',
];

/** CSV of the current filtered view. */
export async function GET(request: Request) {
  if (!isAdminRequest()) {
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

  const lines = [HEADERS.map(cell).join(',')];

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
        (r.amount_cents / 100).toFixed(2),
        r.approval_status,
        r.spot_number ?? '',
        r.waiver_accepted ? 'yes' : 'no',
        r.signature_name,
        r.signed_at ?? '',
        r.agreement_version ?? '',
        r.permit_path ? 'yes' : 'no',
        r.logo_path ? 'yes' : 'no',
        r.photo_paths?.length ?? 0,
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
