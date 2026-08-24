/**
 * Single source of truth for site constants, pricing, event data and JSON-LD.
 * Anything that shows up in metadata, structured data or on a page should come
 * from here so the copy and the schema never drift apart.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://coyoteville.com';

export const SITE = {
  name: 'Coyoteville',
  legalName: 'Coyoteville',
  tagline: 'Food Truck Park and Live Music',
  url: SITE_URL,
  email: 'ceo@36west.org',
  facebook: 'https://facebook.com/coyoteville',
  /**
   * Structured data and social cards take the raster. Crawlers and the social
   * scrapers do not render SVG, so logo/ogImage must stay PNG.
   */
  logo: `${SITE_URL}/logo.png`,
  ogImage: `${SITE_URL}/logo.png`,
  /** In-page brand mark. Vector, so it stays crisp at any nav or footer size. */
  logoSvg: '/logo.svg',
  /** Square mark for the favicon and the apple touch icon. */
  icon: '/icon.png',
} as const;

/**
 * Real pixel size of public/logo.png. The badge is 3:2, not the 1.91:1 social
 * platforms prefer, so these are declared honestly rather than stretched to fit.
 * Facebook, LinkedIn and X letterbox or centre-crop it; they do not distort it.
 */
export const OG_IMAGE = {
  url: SITE.ogImage,
  width: 1200,
  height: 800,
} as const;

export const ADDRESS = {
  street: '150 N. Stadium Road',
  city: 'Alice',
  state: 'Texas',
  stateCode: 'TX',
  zip: '78332',
  county: 'Jim Wells County',
  country: 'US',
  full: '150 N. Stadium Road, Alice, Texas 78332',
  landmark: 'On North Stadium Road between Alice High School and the stadium.',
} as const;

export const GEO = {
  latitude: 27.7526,
  longitude: -98.0697,
} as const;

export const MAPS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=' +
  encodeURIComponent('150 N. Stadium Road, Alice, TX 78332');

/** Flat rate per event. No commission is taken on sales. */
export const PRICING = {
  booth: { id: 'booth', label: 'Vendor Booth', cents: 2500, price: '$25' },
  truck: { id: 'truck', label: 'Food Truck Spot', cents: 5000, price: '$50' },
  free: {
    id: 'free',
    label: 'Coyote Group, Booster Club or Nonprofit',
    cents: 0,
    price: 'Free',
  },
} as const;

export type SpotType = keyof typeof PRICING;

export const SPOT_TYPES: SpotType[] = ['booth', 'truck', 'free'];

export function priceForSpot(spot: string): number | null {
  if (spot === 'booth') return PRICING.booth.cents;
  if (spot === 'truck') return PRICING.truck.cents;
  if (spot === 'free') return 0;
  return null;
}

/** Upcoming events. The first entry drives the event bar and the Event schema. */
export const EVENTS = [
  {
    slug: 'tailgate-kickoff-2026-08-28',
    name: 'Tailgate Kickoff',
    date: '2026-08-28',
    startISO: '2026-08-28T16:00:00-05:00',
    endISO: '2026-08-28T22:00:00-05:00',
    displayDate: 'Friday, August 28, 2026',
    displayTime: '4:00 PM',
    blurb: 'First home game of the season. We open at 4:00 PM.',
  },
] as const;

export const NEXT_EVENT = EVENTS[0];

export const PAST_VENDORS = [
  'MuddyWaterz Food Truck',
  'Refined Taste Caterers and Events',
  'Lumpia Express',
  'Deja Vieux Cajun Creations',
  'Mi Linda',
  "Lucy's Candy Pecans and More",
  'Amazing Kettle Corn',
  'Sweet Nings by Reesa',
  'Bargain 4 Less',
  'Boys and Girls Club of Alice',
] as const;

export const KEYWORDS = [
  'food truck park in Alice TX',
  'food truck park Alice Texas',
  'Coyoteville',
  'Coyoteville Alice TX',
  'live music Alice Texas',
  'food trucks Alice TX',
  'things to do in Alice Texas',
  'Jim Wells County events',
  'vendor booth Alice TX',
  'food truck vendor spots Alice Texas',
  'Alice Coyotes tailgate',
  'tailgate party Alice Texas',
  'craft vendors Alice TX',
  'outdoor events Alice Texas',
  'food truck rally South Texas',
  'North Stadium Road Alice TX',
  'family friendly events Alice Texas',
  'weekend events near Corpus Christi',
];

/** FAQ content. Rendered on the page and emitted as FAQPage schema. */
export const FAQ = [
  {
    q: 'Where is Coyoteville?',
    a: 'We are at 150 N. Stadium Road in Alice, Texas. Look for us on North Stadium Road between Alice High School and the stadium. Parking is easy and the lot is right there.',
  },
  {
    q: 'What does it cost to vend?',
    a: 'A vendor booth is $25 per event. A food truck spot is $50 per event. That is a flat rate. We do not take a cut of your sales.',
  },
  {
    q: 'Do school groups and nonprofits pay?',
    a: 'No. Alice Coyote organizations, booster clubs and nonprofits get a free spot. Pick the free option on the application and we will get you set.',
  },
  {
    q: 'What do I need to bring?',
    a: 'Everything you sell with. Your own tent, tables, chairs, generator, fuel, water, cooking gear and a fire extinguisher. We bring the ground, the lights and the crowd.',
  },
  {
    q: 'Do I need permits and insurance?',
    a: 'Yes. Every vendor handles their own permits, licenses, health department approvals and food handler cards. You also carry your own general liability insurance. We do not cover that for you.',
  },
  {
    q: 'What happens if it rains?',
    a: 'Events run rain or shine. Fees are not refundable. If we have to cancel an event on our end, your fee gets credited toward the next one.',
  },
  {
    q: 'When is the next event?',
    a: 'Tailgate Kickoff on Friday, August 28, 2026 at 4:00 PM. It is the first home game of the season.',
  },
  {
    q: 'Can I sell alcohol?',
    a: 'Not without written approval from us and the right TABC permitting. Ask first.',
  },
  {
    q: 'How do I hold my spot?',
    a: 'Fill out the application, sign the Vendor Participation Agreement and pay. Your spot is not reserved until the fee is paid. Space assignment is up to us so we can keep the layout safe and the traffic moving.',
  },
] as const;

/* ------------------------------------------------------------------ schema */

const postalAddress = {
  '@type': 'PostalAddress',
  streetAddress: ADDRESS.street,
  addressLocality: ADDRESS.city,
  addressRegion: ADDRESS.stateCode,
  postalCode: ADDRESS.zip,
  addressCountry: ADDRESS.country,
};

const geoCoordinates = {
  '@type': 'GeoCoordinates',
  latitude: GEO.latitude,
  longitude: GEO.longitude,
};

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: SITE.logo,
      caption: `${SITE.name} logo`,
    },
    image: SITE.ogImage,
    description: `${SITE.name} is a food truck park and live music venue in ${ADDRESS.city}, ${ADDRESS.state}.`,
    email: SITE.email,
    address: postalAddress,
    sameAs: [SITE.facebook],
    areaServed: [
      { '@type': 'City', name: 'Alice' },
      { '@type': 'AdministrativeArea', name: ADDRESS.county },
    ],
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE.name,
    description: 'Food truck park and live music in Alice, Texas.',
    inLanguage: 'en-US',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['FoodEstablishment', 'EntertainmentBusiness'],
    '@id': `${SITE_URL}/#localbusiness`,
    name: SITE.name,
    alternateName: `${SITE.name} ${ADDRESS.city} ${ADDRESS.stateCode}`,
    description:
      'Food truck park and live music venue in Alice, Texas. Local food trucks, craft and retail vendor booths, live music and tailgate nights on North Stadium Road.',
    slogan: SITE.tagline,
    url: SITE_URL,
    image: SITE.ogImage,
    logo: SITE.logo,
    email: SITE.email,
    priceRange: '$',
    currenciesAccepted: 'USD',
    paymentAccepted: 'Cash, Credit Card, Debit Card',
    address: postalAddress,
    geo: geoCoordinates,
    hasMap: MAPS_URL,
    sameAs: [SITE.facebook],
    servesCuisine: ['American', 'Tex-Mex', 'Barbecue', 'Cajun', 'Filipino', 'Desserts'],
    areaServed: [
      {
        '@type': 'City',
        name: 'Alice',
        containedInPlace: { '@type': 'AdministrativeArea', name: ADDRESS.county },
      },
      { '@type': 'AdministrativeArea', name: ADDRESS.county },
      { '@type': 'City', name: 'Orange Grove' },
      { '@type': 'City', name: 'Premont' },
      { '@type': 'City', name: 'Ben Bolt' },
      { '@type': 'City', name: 'Kingsville' },
      { '@type': 'City', name: 'Corpus Christi' },
    ],
    amenityFeature: [
      { '@type': 'LocationFeatureSpecification', name: 'Live Music', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Food Trucks', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Vendor Booths', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Outdoor Seating', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Free Parking', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Family Friendly', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Pet Friendly', value: true },
    ],
    isAccessibleForFree: true,
    publicAccess: true,
    parentOrganization: { '@id': `${SITE_URL}/#organization` },
  };
}

export function eventSchema() {
  const e = NEXT_EVENT;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${SITE_URL}/#event-${e.slug}`,
    name: `${e.name} at ${SITE.name}`,
    description: `${e.blurb} Food trucks, vendor booths and live music at ${SITE.name} in ${ADDRESS.city}, ${ADDRESS.state}.`,
    startDate: e.startISO,
    endDate: e.endISO,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: SITE.ogImage,
    url: SITE_URL,
    location: {
      '@type': 'Place',
      name: SITE.name,
      address: postalAddress,
      geo: geoCoordinates,
      hasMap: MAPS_URL,
    },
    organizer: { '@id': `${SITE_URL}/#organization` },
    performer: { '@type': 'PerformingGroup', name: 'Live Music' },
    isAccessibleForFree: true,
    offers: [
      {
        '@type': 'Offer',
        name: 'General Admission',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: SITE_URL,
        validFrom: '2026-01-01T00:00:00-06:00',
      },
      {
        '@type': 'Offer',
        name: PRICING.booth.label,
        price: '25.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/#apply`,
        validFrom: '2026-01-01T00:00:00-06:00',
      },
      {
        '@type': 'Offer',
        name: PRICING.truck.label,
        price: '50.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/#apply`,
        validFrom: '2026-01-01T00:00:00-06:00',
      },
    ],
  };
}

export function faqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/#faq`,
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function breadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Vendor Application', item: `${SITE_URL}/#apply` },
    ],
  };
}

export function homeSchemaGraph() {
  return [
    organizationSchema(),
    websiteSchema(),
    localBusinessSchema(),
    eventSchema(),
    faqSchema(),
    breadcrumbSchema(),
  ];
}
