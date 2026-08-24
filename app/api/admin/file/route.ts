import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getUploadPath } from '@/lib/admin-data';
import { MEDIA_BUCKET, PERMIT_BUCKET, signedUrl } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Gate in front of every stored upload.
 *
 * Neither bucket is public, so this is the only way to see a file. It checks the
 * admin session, looks the path up from the row rather than taking it from the
 * query string, mints a short lived signed URL and redirects to it. Using it as
 * an <img src> means thumbnails cost nothing until they are actually rendered,
 * and a permit link is never a permanent public URL.
 */
export async function GET(request: Request) {
  if (!isAdminRequest()) {
    return new NextResponse('Not signed in.', { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const kindParam = url.searchParams.get('kind') ?? '';
  const index = Number(url.searchParams.get('i') ?? '0');

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Bad id.', { status: 400 });
  }

  if (!['logo', 'permit', 'photo'].includes(kindParam)) {
    return new NextResponse('Bad kind.', { status: 400 });
  }

  const kind = kindParam as 'logo' | 'permit' | 'photo';
  const path = await getUploadPath(id, kind, Number.isFinite(index) ? index : 0);

  if (!path) {
    return new NextResponse('No file.', { status: 404 });
  }

  const bucket = kind === 'permit' ? PERMIT_BUCKET : MEDIA_BUCKET;
  const target = await signedUrl(bucket, path, 600);

  if (!target) {
    return new NextResponse('Could not open that file.', { status: 502 });
  }

  return NextResponse.redirect(target, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=0, no-store' },
  });
}
