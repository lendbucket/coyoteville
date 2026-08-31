import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

/**
 * A separate manifest for the tracker.
 *
 * The site manifest starts at "/", so saving the tracker to a home screen from
 * that one would launch the public page and leave you tapping through to
 * /admin every time. A manifest can only carry one start_url, so the tracker
 * gets its own, served from its own route and linked from the admin page's
 * metadata.
 *
 * scope keeps it to /admin: opening a link out to the public site from inside
 * the installed app hands it back to the browser, which is the right behaviour
 * for a staff tool.
 */
export function GET() {
  return NextResponse.json(
    {
      name: 'Coyoteville Vendor Tracker',
      short_name: 'Tracker',
      description:
        'Staff tool. Vendor applications, payments, waitlist and email for Coyoteville events.',
      start_url: '/admin',
      scope: '/admin',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#0B0B0C',
      theme_color: '#0B0B0C',
      /* The 'any' icons are the shared marks on a white plate, which is what a
         browser tab and a bookmark want.

         The maskable one is its own file and has to be. A maskable icon is
         cropped to a circle 80% of its width, and the shared 512 puts the badge
         232px from the centre against a 205px safe radius, so Android was
         clipping the ends off COYOTEVILLE. This one sits the badge on the same
         #0B0B0C the splash uses, scaled to fit inside that circle. The badge
         carries its own plate clipped to its outline, so it reads on the dark
         ground rather than disappearing into it. */
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/admin-icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
