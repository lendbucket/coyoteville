import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, COOKIE_OPTIONS, checkPassword, isAdminConfigured, issueToken } from '@/lib/admin-auth';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Password login. Rate limited so the shared password cannot be ground down. */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = rateLimit(`admin-login:${ip}`, 8, 10 * 60 * 1000);

  if (!limit.ok) {
    return NextResponse.redirect(new URL('/admin?e=rate', request.url), { status: 303 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.redirect(new URL('/admin?e=unset', request.url), { status: 303 });
  }

  const form = await request.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');

  if (!checkPassword(password)) {
    return NextResponse.redirect(new URL('/admin?e=bad', request.url), { status: 303 });
  }

  const token = issueToken();
  const response = NextResponse.redirect(new URL('/admin', request.url), { status: 303 });
  response.cookies.set(ADMIN_COOKIE, token.value, { ...COOKIE_OPTIONS, maxAge: token.maxAge });
  return response;
}
