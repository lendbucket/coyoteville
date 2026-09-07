import { isAdminRequest } from '@/lib/admin-auth';
import { getEventBySlug } from '@/lib/events-source';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { PROGRAM_NAME, VOLUNTEER_MINIMUM } from '@/lib/parking-fundraiser';
import { SITE_URL } from '@/lib/seo';
import qrcode from 'qrcode-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A sheet of paper with a QR code on it, for the volunteer table.
 *
 * Returns a whole HTML page rather than an image, because what Robert wants is
 * not a PNG in his downloads folder: it is something he opens and presses print
 * on, that comes out of a printer readable across a table in the dark. So the
 * page carries the code, the game, the organization, and the URL written out
 * underneath in case somebody's camera will not focus.
 *
 * Rendered entirely on the server. qrcode-generator has no dependencies and
 * never reaches the browser: the response is an SVG path inside static HTML, so
 * the printed sheet costs the tracker bundle nothing at all.
 *
 * Error correction level M with a quiet zone of four modules, which is the
 * specified minimum. This gets taped to a table outdoors and will be scanned in
 * bad light by phones held at an angle, and a code with no margin is a code that
 * half the phones refuse.
 */
function svgFor(url: string, modulePx: number): { svg: string; modules: number } {
  /* Type 0 lets the library pick the smallest version that fits the URL, so a
     short link prints as a coarse code with big modules, which is exactly what
     scans well from a distance. */
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 4;
  const size = (count + quiet * 2) * modulePx;

  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      const x = (col + quiet) * modulePx;
      const y = (row + quiet) * modulePx;
      path += `M${x} ${y}h${modulePx}v${modulePx}h-${modulePx}z`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code linking to the volunteer waiver">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`;

  return { svg, modules: count };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return new Response('Not signed in.', { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const eventSlug = String(params.get('event') ?? '');
  const orgId = String(params.get('org') ?? '');

  const event = await getEventBySlug(eventSlug);
  if (!event) return new Response('Unknown event.', { status: 404 });

  let orgName: string | null = null;
  if (/^[0-9a-f-]{36}$/i.test(orgId) && isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('org_applications')
        .select('org_name')
        .eq('id', orgId)
        .maybeSingle();
      orgName = (data as { org_name: string } | null)?.org_name ?? null;
    } catch (err) {
      console.error('could not read the organization for a QR sheet', err);
    }
  }

  /* The exact link the volunteer lands on. Built here from the same two
     parameters the page reads, so the printed code and the page cannot drift:
     a QR that points at a URL nobody handles is only discovered at the table. */
  const target = new URL('/volunteer', SITE_URL);
  target.searchParams.set('event', event.slug);
  if (orgName) target.searchParams.set('org', orgId);

  const url = target.toString();
  const { svg, modules } = svgFor(url, 8);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Volunteer waiver QR, ${esc(event.name)}</title>
<style>
  /* Sized for one sheet of paper. Everything on this page exists to be read
     across a folding table in a dark parking lot, which is why the code is
     enormous and the type under it is not much smaller. */
  @page { size: letter portrait; margin: 0.5in; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0.5in;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #000;
    background: #fff;
    text-align: center;
  }
  h1 { margin: 0 0 4px; font-size: 34pt; line-height: 1.05; letter-spacing: -0.01em; }
  .sub { margin: 0 0 6px; font-size: 19pt; font-weight: 700; }
  .when { margin: 0 0 18px; font-size: 15pt; }
  .qr { margin: 0 auto 16px; width: 4.6in; max-width: 100%; }
  .qr svg { width: 100%; height: auto; display: block; }
  .url { margin: 0 0 14px; font-size: 11pt; word-break: break-all; }
  .note { margin: 0 auto; max-width: 6in; font-size: 12pt; line-height: 1.45; }
  .rule { margin: 20px auto; width: 4in; border: 0; border-top: 2px solid #000; }
  .print { margin-top: 22px; }
  .print button {
    font: inherit; font-size: 13pt; padding: 10px 20px;
    border: 2px solid #000; background: #fff; cursor: pointer;
  }
  @media print { .print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <h1>Scan to sign</h1>
  <p class="sub">Volunteer waiver</p>
  <p class="when">${esc(event.name)}, ${esc(event.displayDate)}</p>

  <div class="qr">${svg}</div>

  <p class="url">${esc(url)}</p>

  <hr class="rule">

  <p class="note">
    ${orgName ? `Volunteers with <strong>${esc(orgName)}</strong>. ` : ''}Everybody who works tonight
    signs before they start. It takes about a minute on your phone. Adults count toward the
    ${VOLUNTEER_MINIMUM} your organization promised. Anyone under 18 needs a parent or guardian to
    sign and to stay on site.
  </p>

  <div class="print"><button type="button" onclick="window.print()">Print this sheet</button></div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      /* The sheet names an organization and a game. It is behind the admin
         session and should never sit in a shared cache or an index. */
      'X-Robots-Tag': 'noindex, nofollow',
      'X-QR-Modules': String(modules),
      'X-Program': PROGRAM_NAME,
    },
  });
}
