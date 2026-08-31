import type { Metadata, Viewport } from 'next';
import { Anton, Barlow_Condensed, Karla, Yellowtail } from 'next/font/google';
import { SITE, SITE_URL, ADDRESS, GEO, KEYWORDS, OG_IMAGE } from '@/lib/seo';
import { supportEmail } from '@/lib/support';
import './globals.css';

/** Display type. Condensed, heavy, reads like painted lot signage. */
const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-anton',
  fallback: ['Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'sans-serif'],
});

/** Labels, eyebrows and buttons. Scoreboard lettering. */
const barlowCondensed = Barlow_Condensed({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-barlow',
  fallback: ['Arial Narrow', 'system-ui', 'sans-serif'],
});

const karla = Karla({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-karla',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
});

const yellowtail = Yellowtail({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-yellowtail',
  fallback: ['Brush Script MT', 'cursive'],
});

const TITLE = 'Food Truck Park in Alice TX | Coyoteville Live Music';
/**
 * Kept between 140 and 160 characters. Google renders about 155 and truncates
 * the rest, and the previous one was 296.
 */
const DESCRIPTION =
  'Coyoteville is an outdoor food truck park in Alice, TX, across from the stadium. Local food trucks, live music, free admission. Gates 4 PM Fridays.';

export const viewport: Viewport = {
  themeColor: '#0B0B0C',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
  /**
   * The tracker's tab bar sits against the bottom edge and pads itself with
   * env(safe-area-inset-bottom). Those insets read as zero unless the viewport
   * covers the whole screen, so without this the bar would float above a white
   * strip on a notched iPhone and sit under the home indicator.
   */
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE.name}`,
  },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE_URL }],
  creator: SITE.name,
  publisher: SITE.name,
  category: 'Food and Entertainment',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: OG_IMAGE.url,
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
        alt: `${SITE.name}, a food truck park in ${ADDRESS.city}, ${ADDRESS.stateCode}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.webmanifest',
  icons: {
    /* Raster only, deliberately.
     *
     * This used to list /logo.svg first, which browsers that accept an SVG
     * favicon duly took. That is the full brand lockup: 115kB after
     * optimisation, fetched a second time on top of the preload React already
     * emits for the same file in the nav, to be drawn into a 16px square.
     *
     * These PNGs are the same artwork and are what every browser without SVG
     * favicon support was already showing, so the tab does not change. At 16px
     * the wordmark inside the lockup is unreadable at any file size, which is a
     * property of the mark rather than of the format: fixing that means a
     * favicon cropped to the emblem, which is a change to the icon itself and
     * not something to slip into a performance pass.
     *
     * Safari does not accept an SVG apple touch icon, so that one is always the
     * square raster, and it is a real 180x180 file rather than a 512 declared
     * as 180.
     */
    icon: [
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: SITE.icon, type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  other: {
    // Geo targeting for local search.
    'geo.region': `US-${ADDRESS.stateCode}`,
    'geo.placename': `${ADDRESS.city}, ${ADDRESS.state}`,
    'geo.position': `${GEO.latitude};${GEO.longitude}`,
    ICBM: `${GEO.latitude}, ${GEO.longitude}`,
    'business:contact_data:street_address': ADDRESS.street,
    'business:contact_data:locality': ADDRESS.city,
    'business:contact_data:region': ADDRESS.state,
    'business:contact_data:postal_code': ADDRESS.zip,
    'business:contact_data:country_name': 'United States',
    'business:contact_data:email': supportEmail(),
  },
};

/**
 * The two faces that paint above the fold, preloaded by hand.
 *
 * next/font preloads on its own through next-font-manifest.json. On this build
 * that manifest comes out empty, app: {} and appUsingSizeAdjust: false, even
 * though the size-adjust fallbacks it claims not to have are demonstrably in
 * the emitted CSS. So nothing is preloaded, and both faces are discovered only
 * after the stylesheet parses, which puts a round trip in front of the first
 * painted headline.
 *
 * Only these two. Anton sets the h1 and Barlow Condensed 700 sets the eyebrow,
 * the ticker and the buttons, all of which are in the first viewport. Karla,
 * Yellowtail and the 500 and 600 weights of Barlow are further down and are
 * left to be fetched when they are reached: a preload that is not needed
 * immediately competes with the LCP image, which is the opposite of the point.
 *
 * These are the latin (u+00??) subsets, which is the only one a page of English
 * touches. The hashes come from the font file contents and change only when the
 * face or the subset changes, and scripts/check-font-preload.js fails the build
 * if either stops matching a real file that the CSS actually references, so a
 * stale entry here cannot ship as a 404 or a wasted fetch.
 */
const PRELOAD_FONTS = [
  '/_next/static/media/62c97acc3aa63787-s.p.woff2', // Anton 400
  '/_next/static/media/437e5f23c97e320c-s.p.woff2', // Barlow Condensed 700
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${barlowCondensed.variable} ${karla.variable} ${yellowtail.variable}`}
    >
      <head>
        {PRELOAD_FONTS.map((href) => (
          <link
            key={href}
            rel="preload"
            as="font"
            type="font/woff2"
            href={href}
            /* Fonts are always fetched in CORS mode, even same origin, so
               without this the preload does not match the request the font
               loader makes and the file is downloaded twice. */
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
