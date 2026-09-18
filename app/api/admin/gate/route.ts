import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { getGateSnapshot } from '@/lib/gate-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recent parking payments, for the gate.
 *
 * Behind the same admin cookie as the rest of the tracker and nothing else: it
 * reports whether a card ending in four digits paid, which is somebody's
 * payment and not public.
 *
 * Returns the whole window rather than answering one query, on purpose. The
 * phone holding this is on stadium signal, and a request per search is a
 * request that fails at the moment somebody is standing in front of you. One
 * page of payments is a few kilobytes, the browser keeps it, and every search
 * after that is local and instant.
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 });
  }

  const snapshot = await getGateSnapshot();

  return NextResponse.json(snapshot, {
    /* Never a shared cache: this is one venue's takings behind one cookie. A
       few seconds on the device is fine and takes the edge off a double tap. */
    headers: { 'Cache-Control': 'private, max-age=5' },
  });
}
