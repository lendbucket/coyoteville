import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, COOKIE_OPTIONS } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/admin', request.url), { status: 303 });
  response.cookies.set(ADMIN_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
