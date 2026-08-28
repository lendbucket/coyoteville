import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, COOKIE_OPTIONS, checkPassword, isAdminConfigured, issueToken } from '@/lib/admin-auth';
import type { LoginErrorCode } from '@/components/admin/login-errors';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * True when the caller wants an answer rather than a new page.
 *
 * The sign in card fetches with an explicit Accept, so it gets JSON back and
 * can show a wrong password inline. A browser posting the form itself sends
 * Accept: text/html and still gets the redirect it has always got.
 */
function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function refuse(request: Request, code: LoginErrorCode, status: number) {
  if (wantsJson(request)) {
    return NextResponse.json({ ok: false, error: code }, { status });
  }
  return NextResponse.redirect(new URL(`/admin?e=${code}`, request.url), { status: 303 });
}

/** Password login. Rate limited so the shared password cannot be ground down. */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = rateLimit(`admin-login:${ip}`, 8, 10 * 60 * 1000);

  if (!limit.ok) {
    return refuse(request, 'rate', 429);
  }

  if (!isAdminConfigured()) {
    return refuse(request, 'unset', 503);
  }

  const form = await request.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');

  if (!checkPassword(password)) {
    return refuse(request, 'bad', 401);
  }

  const token = issueToken();
  const response = wantsJson(request)
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL('/admin', request.url), { status: 303 });
  response.cookies.set(ADMIN_COOKIE, token.value, { ...COOKIE_OPTIONS, maxAge: token.maxAge });
  return response;
}
