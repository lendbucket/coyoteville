import { isAdminRequest } from '@/lib/admin-auth';
import { MEDIA_BUCKET, signedUrl } from '@/lib/uploads';
import {
  PARKING_PRICE_CENTS,
  currentParkingEvent,
  dollars,
  getAwardedOrg,
} from '@/lib/parking';
import { SITE_URL } from '@/lib/seo';
import qrcode from 'qrcode-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A sheet of paper with the parking QR on it, for the post at the gate.
 *
 * The same shape as the volunteer waiver sheet and for the same reason: what
 * Robert wants is not a PNG in his downloads folder, it is something he opens
 * and presses print on that comes out readable from a car window at dusk.
 *
 * Error correction M with a four module quiet zone, which is the specified
 * minimum. This is scanned from a moving queue by phones held at an angle
 * through a windscreen, and a code with no margin is a code half the phones
 * refuse. The URL is spelled out underneath for the camera that will not focus.
 *
 * The code points at /park and carries no event in it. The page resolves the
 * night itself, so this sheet is printed once and works every game after this
 * one, which is the only way a laminated sign is worth laminating.
 */
function svgFor(url: string, modulePx: number): { svg: string; modules: number } {
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
    `viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code linking to the parking page">` +
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

/**
 * The logo, inlined rather than linked.
 *
 * A signed storage URL expires. A sheet saved as a PDF today and printed next
 * Friday would print a broken image box in the middle of the sign, so the bytes
 * go into the document.
 */
async function logoDataUri(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;

  try {
    const url = await signedUrl(MEDIA_BUCKET, logoPath, 600);
    if (!url) return null;

    const res = await fetch(url);
    if (!res.ok) return null;

    const type = res.headers.get('content-type') ?? 'image/png';
    const bytes = Buffer.from(await res.arrayBuffer());

    /* A logo that would bloat the sheet is dropped rather than embedded. The
       sign works without it; a twelve megabyte print job does not. */
    if (bytes.length > 2_000_000) return null;

    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch (err) {
    console.error('could not inline the org logo for the parking sheet', err);
    return null;
  }
}

export async function GET() {
  if (!(await isAdminRequest())) {
    return new Response('Not signed in.', { status: 401 });
  }

  const event = await currentParkingEvent();
  if (!event) {
    return new Response('There is no upcoming event to print a parking sheet for.', {
      status: 404,
    });
  }

  const org = await getAwardedOrg(event.slug);
  const logo = await logoDataUri(org?.logoPath ?? null);

  const url = `${SITE_URL}/park`;
  const { svg, modules } = svgFor(url, 8);
  const price = dollars(PARKING_PRICE_CENTS);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Parking QR, ${esc(event.name)}</title>
<style>
  /* One sheet of paper, read from a car. The price is the largest thing on it
     and the code is the second, because a driver decides in about two seconds
     whether this sign is worth stopping for. */
  @page { size: letter portrait; margin: 0.4in; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0.4in;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #000;
    background: #fff;
    text-align: center;
  }
  h1 { margin: 0 0 2px; font-size: 76pt; line-height: 0.95; letter-spacing: -0.02em; }
  .sub { margin: 0 0 14px; font-size: 22pt; font-weight: 700; }
  .qr { margin: 0 auto 10px; width: 4.4in; max-width: 100%; }
  .qr svg { width: 100%; height: auto; display: block; }
  .scan { margin: 0 0 6px; font-size: 20pt; font-weight: 700; }
  .url { margin: 0 0 16px; font-size: 12pt; word-break: break-all; }
  .rule { margin: 16px auto; width: 4in; border: 0; border-top: 2px solid #000; }
  .org { margin: 0 auto; max-width: 6in; font-size: 17pt; line-height: 1.35; }
  .org strong { display: block; font-size: 21pt; margin-top: 4px; }
  .logo { max-width: 2.4in; max-height: 1.3in; margin: 10px auto 0; display: block; }
  .print { margin-top: 20px; }
  .print button {
    font: inherit; font-size: 13pt; padding: 10px 20px;
    border: 2px solid #000; background: #fff; cursor: pointer;
  }
  @media print { .print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <h1>Parking ${esc(price)}</h1>
  <p class="sub">${esc(event.name)}, ${esc(event.displayDate)}</p>

  <p class="scan">Scan to pay</p>
  <div class="qr">${svg}</div>
  <p class="url">${esc(url)}</p>

  <hr class="rule">

  <p class="org">
    ${
      org
        ? `50% of tonight's parking goes to<strong>${esc(org.name)}</strong>`
        : 'Apple Pay and Google Pay work here. Cash and card also taken at the gate.'
    }
  </p>
  ${logo ? `<img class="logo" src="${logo}" alt="${esc(org ? org.name : '')}">` : ''}

  <div class="print"><button type="button" onclick="window.print()">Print this sheet</button></div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-QR-Modules': String(modules),
    },
  });
}
