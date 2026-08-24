import type { Metadata, Viewport } from 'next';
import { Ultra, Karla, Yellowtail } from 'next/font/google';
import { SITE, SITE_URL, ADDRESS, GEO, KEYWORDS } from '@/lib/seo';
import './globals.css';

const ultra = Ultra({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ultra',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
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
  themeColor: '#12100E',
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
        url: SITE.ogImage,
        width: 1200,
        height: 630,
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
    icon: '/logo.png',
    apple: '/logo.png',
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
    <html lang="en" className={`${ultra.variable} ${karla.variable} ${yellowtail.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
