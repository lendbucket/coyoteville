import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  const limit = rateLimit(`subscribe:${ip}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many tries. Give it a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ ok: false, error: 'We could not read that.' }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 180) {
    return NextResponse.json(
      { ok: false, error: 'That email does not look right.' },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'The list is not connected yet. Check back soon.' },
      { status: 503 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('subscribers')
    .upsert(
      {
        email,
        source: 'homepage',
        signup_ip: ip,
        unsubscribed_at: null,
      },
      { onConflict: 'email' }
    );

  if (error) {
    console.error('subscriber upsert failed', error);
    return NextResponse.json(
      { ok: false, error: 'That did not go through. Try again in a minute.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
