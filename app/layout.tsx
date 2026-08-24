import type { Metadata, Viewport } from 'next';
import { Anton, Barlow_Condensed, Karla, Yellowtail } from 'next/font/google';
import { SITE, SITE_URL, ADDRESS, GEO, KEYWORDS, OG_IMAGE } from '@/lib/seo';
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
const DESCRIPTION =
  'Coyoteville is a food truck park in Alice TX with live music, local food trucks and vendor booths on North Stadium Road. Booths are $25, truck spots are $50, flat rate with no commission.';

export const viewport: Viewport = {
  themeColor: '#0B0B0C',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
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
  icons: {
    // SVG first for browsers that take it, PNG as the fallback. Safari does not
    // accept an SVG apple touch icon, so that one is always the square raster.
    icon: [
      { url: SITE.logoSvg, type: 'image/svg+xml' },
      { url: SITE.icon, type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: SITE.icon, sizes: '180x180' }],
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
    'business:contact_data:email': SITE.email,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${barlowCondensed.variable} ${karla.variable} ${yellowtail.variable}`}
    >
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
