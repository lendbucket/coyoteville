import { NextResponse } from 'next/server';
import { VENDOR_COOKIE, VENDOR_COOKIE_OPTIONS } from '@/lib/vendors';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Drop the vendor session. A POST so a link prefetch cannot sign somebody out. */
export async function POST() {
  const response = NextResponse.redirect(`${SITE_URL}/`, { status: 303 });
  response.cookies.set(VENDOR_COOKIE, '', { ...VENDOR_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
