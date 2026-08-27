/**
 * Single source of truth for site constants, pricing, event data and JSON-LD.
 * Anything that shows up in metadata, structured data or on a page should come
 * from here so the copy and the schema never drift apart.
 */

import { EVENT_TIMEZONE, parseZonedWallClock, zoneAbbreviation } from './time';

export { EVENT_TIMEZONE };

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://coyoteville.com';

export const SITE = {
  name: 'Coyoteville',
  legalName: 'Coyoteville',
  tagline: 'Food Truck Park and Live Music',
  url: SITE_URL,
  /**
   * Public contact address. Server code should call supportEmail() from
   * lib/support so SUPPORT_EMAIL is honoured; this is the fallback and the
   * value client components get unless one is passed to them.
   */
  email: 'support@coyoteville.com',
  /**
   * Where new vendor alerts go. Internal only, never rendered on the site.
   */
  ownerEmail: 'ceo@36west.org',
  facebook: 'https://facebook.com/coyoteville',
  instagram: 'https://instagram.com/coyoteville',
  /** Handle without the @, for the visible label on both links. */
  socialHandle: 'coyoteville',
  /** E.164 for structured data, and a readable form for display. */
  telephone: '+15404479432',
  telephoneDisplay: '540 447 9432',
  /**
   * Structured data and social cards take the raster. Crawlers and the social
   * scrapers do not render SVG, so logo/ogImage must stay PNG.
   */
  logo: `${SITE_URL}/logo.png`,
  /** Purpose built 1.91:1 social card. The badge itself is 3:2 and would be cropped. */
  ogImage: `${SITE_URL}/og.png`,
  /** In-page brand mark. Vector, so it stays crisp at any nav or footer size. */
  logoSvg: '/logo.svg',
  /** Square mark for the favicon and the apple touch icon. */
  icon: '/icon.png',
} as const;

/**
 * The social card. public/og.png is generated at exactly 1200x630, the ratio
 * every platform crops to, with the badge centred on the brand field rather
 * than the 3:2 badge stretched to fit.
 */
export const OG_IMAGE = {
  url: SITE.ogImage,
  width: 1200,
  height: 630,
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

/** Flat rate per event. We take no percentage of what a vendor earns. */
export const PRICING = {
  booth: { id: 'booth', label: 'Vendor Booth', cents: 2500, price: '$25' },
  truck: { id: 'truck', label: 'Food Truck Spot', cents: 5000, price: '$50' },
  free: {
    id: 'free',
    label: 'Alice Organization',
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

/**
 * The event calendar.
 *
 * Kept in date order, oldest first. This is the static half of the schedule:
 * names, dates and display strings that have to be identical in the page, the
 * metadata and the structured data. The events table in Supabase carries the
 * parts that change without a deploy, capacity and the signup deadline, and
 * lib/event-schedule.ts merges the two.
 *
 * `signupClosesLocal` and `gatesOpenLocal` are wall clock times in
 * EVENT_TIMEZONE (America/Chicago), not offsets. The daylight saving offset is
 * worked out from the zone, so a winter event gets CST on its own.
 *
 * The house rule for a deadline is two days before the event at 11:59 PM. Both
 * entries below follow it, and defaultSignupCloses() reproduces it for anything
 * added later, so a new event does not strictly need its own literal.
 */
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

    /** Vendor signup cutoff. After this the form closes, server side. */
    signupClosesLocal: '2026-08-26T23:59:59',
    signupClosesDisplay: 'Wednesday, August 26, 2026 at 11:59 PM',

    /** Gates open. Drives the event countdown section. */
    gatesOpenLocal: '2026-08-28T16:00:00',
  },
  {
    slug: 'home-game-2026-09-11',
    name: 'Alice Home Game',
    date: '2026-09-11',
    startISO: '2026-09-11T16:00:00-05:00',
    endISO: '2026-09-11T22:00:00-05:00',
    displayDate: 'Friday, September 11, 2026',
    displayTime: '4:00 PM',
    blurb: 'Alice home game night. We open at 4:00 PM.',

    signupClosesLocal: '2026-09-09T23:59:59',
    signupClosesDisplay: 'Wednesday, September 9, 2026 at 11:59 PM',

    gatesOpenLocal: '2026-09-11T16:00:00',
  },
] as const;

export type EventConfig = (typeof EVENTS)[number];

/**
 * Every event, oldest first.
 *
 * EVENTS is already written in order; this sorts anyway so that adding one in
 * the wrong place cannot silently reorder the dropdown or the schema.
 */
export const UPCOMING_EVENTS: readonly EventConfig[] = [...EVENTS].sort((a, b) =>
  a.date.localeCompare(b.date)
);

/**
 * The soonest event, whether or not its signup has closed.
 *
 * Still the right anchor for "where to find us" copy and the gates countdown,
 * which stay true right up to the event itself. Anything about *applying*
 * should use nextOpenEvent() instead, because signup shuts two days out while
 * this still points at the same event.
 */
export const NEXT_EVENT = UPCOMING_EVENTS[0];

/** The house rule: two days before the event, 11:59 PM local. */
export function defaultSignupCloses(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const two = new Date(Date.UTC(y, m - 1, d - 2));
  return two.toISOString().slice(0, 10) + 'T23:59:59';
}

/** UTC instant of an event's signup cutoff, resolved from its wall clock time. */
export function signupClosesAt(event: EventConfig = NEXT_EVENT): number {
  return parseZonedWallClock(event.signupClosesLocal, EVENT_TIMEZONE);
}

/** UTC instant an event's gates open. */
export function gatesOpenAt(event: EventConfig = NEXT_EVENT): number {
  return parseZonedWallClock(event.gatesOpenLocal, EVENT_TIMEZONE);
}

/**
 * Whether vendor signup is shut for an event.
 *
 * The API route calls this before it will accept an application, so closing is
 * enforced on the server and not just hidden in the UI. This reads the static
 * deadline; lib/event-schedule.ts is the version that honours an override set
 * in the events table, and is what the route actually calls.
 */
export function isSignupClosed(event: EventConfig = NEXT_EVENT, now: number = Date.now()): boolean {
  return now >= signupClosesAt(event);
}

/** Zone label for the cutoff, eg "CDT". Rendered next to the deadline. */
export function signupClosesZone(event: EventConfig = NEXT_EVENT): string {
  return zoneAbbreviation(signupClosesAt(event), EVENT_TIMEZONE);
}

/** UTC instant an event finishes. */
export function eventEndsAt(event: EventConfig): number {
  const parsed = Date.parse(event.endISO);
  return Number.isNaN(parsed) ? gatesOpenAt(event) : parsed;
}

/**
 * The next event by date: the soonest one that has not finished yet.
 *
 * This is what the public half of the site means by "next". The hero, the
 * countdown bar and the visit panel all point at the event people are actually
 * coming to, which stays true after vendor signup shuts two days out and only
 * moves on once the night is over. Anything about *applying* wants
 * nextOpenEvent() instead.
 *
 * Falls back to the last event in the calendar when every one has been and
 * gone, so callers always get something to render rather than null.
 */
export function nextEventByDate(now: number = Date.now()): EventConfig {
  return (
    UPCOMING_EVENTS.find((e) => eventEndsAt(e) > now) ??
    UPCOMING_EVENTS[UPCOMING_EVENTS.length - 1]
  );
}

/** Long form date for an instant, in the event's own timezone. */
export function formatEventDeadline(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(ms))
    .replace(' at ', ' at ');
}

/** Look up one event by slug. */
export function eventBySlug(slug: string): EventConfig | null {
  return UPCOMING_EVENTS.find((e) => e.slug === slug) ?? null;
}

/**
 * The soonest event whose signup is still open, or null when every one of them
 * has closed. Drives the countdown bar and the default in the vendor form.
 */
export function nextOpenEvent(now: number = Date.now()): EventConfig | null {
  return UPCOMING_EVENTS.find((e) => !isSignupClosed(e, now)) ?? null;
}

/**
 * Game night logistics. One source for the section, the FAQ and the FAQPage
 * schema, because the admission and parking terms are what people search for
 * and the three places must not drift apart.
 */
export const GAME_NIGHT = [
  {
    label: 'Admission is free',
    body: 'There is no cover and no ticket to walk in and eat.',
  },
  {
    label: 'Parking',
    body: 'Parking opens on the lot at kickoff for $10 per vehicle.',
  },
] as const;

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
    a: 'We are at 150 N. Stadium Road in Alice, Texas, directly across from the stadium and next to Alice High School.',
  },
  {
    q: 'What time do you open?',
    a: 'We open at 4:00 PM before home games. Admission is free.',
  },
  {
    q: 'Is there parking at Coyoteville?',
    a: 'Parking opens on the lot at kickoff for $10 per vehicle.',
  },
  {
    q: 'What does it cost to vend?',
    a: 'A vendor booth is $25 per event. A food truck spot is $50 per event. That is the whole fee. We do not take a percentage of your sales.',
  },
  {
    q: 'Do Alice organizations pay?',
    a: 'No. Any Alice organization sets up at no charge and keeps everything it raises. That covers band, colorguard, athletics, clubs, churches and youth groups. Pick the organization option on the application.',
  },
  {
    q: 'What do I need to bring as a vendor?',
    a: 'Your own table, chairs, canopy and decorations. Trucks bring their own generator, fuel and water. Everyone brings a fire extinguisher rated for what they are cooking. One vehicle per space.',
  },
  {
    q: 'Do I need permits and insurance?',
    a: 'Yes. Every food truck must hold a current Texas Department of State Health Services health permit and upload it when registering, and must bring it along with food handler certificates to the event. Vendors handle their own licenses and health department approvals, and carry their own general liability insurance. We do not provide coverage.',
  },
  {
    q: 'What happens if it rains?',
    a: 'Events run rain or shine and vendor fees are not refundable. If we cancel an event ourselves, your fee is credited to the next one.',
  },
  {
    q: 'When is the next event?',
    a: 'Tailgate Kickoff, Friday, August 28, 2026 at 4:00 PM. It is the first home game of the season.',
  },
  {
    q: 'Can I sell alcohol?',
    a: 'Not without written approval from us and the right TABC permitting. Ask before you apply.',
  },
  {
    q: 'How do I hold my spot?',
    a: 'Fill out the application, upload your permit if you serve food, sign the Vendor Participation Agreement and pay. The spot is not held until the fee is in. We assign spaces so the layout stays safe.',
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

export function organizationSchema(email: string = SITE.email) {
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
    description: `${SITE.name} is an outdoor food truck park at ${ADDRESS.street} in ${ADDRESS.city}, ${ADDRESS.state}, across from the stadium. Admission is free.`,
    email,
    telephone: SITE.telephone,
    address: postalAddress,
    sameAs: [SITE.facebook, SITE.instagram],
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
    description: 'Outdoor food truck park on North Stadium Road in Alice, Texas. Opens 4:00 PM before home games.',
    inLanguage: 'en-US',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function localBusinessSchema(email: string = SITE.email) {
  return {
    '@context': 'https://schema.org',
    '@type': ['FoodEstablishment', 'EntertainmentBusiness'],
    '@id': `${SITE_URL}/#localbusiness`,
    name: SITE.name,
    alternateName: `${SITE.name} ${ADDRESS.city} ${ADDRESS.stateCode}`,
    description:
      'Outdoor food truck park at 150 N. Stadium Road in Alice, Texas, directly across from the stadium. Local food trucks, vendor booths and live music before and after home games. Admission is free. Parking on the lot opens at kickoff for $10 per vehicle.',
    slogan: SITE.tagline,
    url: SITE_URL,
    image: SITE.ogImage,
    logo: SITE.logo,
    email,
    telephone: SITE.telephone,
    /**
     * Gates open at 4:00 PM on event Fridays and we run to 10:00 PM. Stated as
     * an openingHoursSpecification as well as the plain string, because Google
     * reads the structured form and the string is the human fallback.
     */
    openingHours: 'Fr 16:00-22:00',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Friday',
        opens: '16:00',
        closes: '22:00',
      },
    ],
    priceRange: '$',
    currenciesAccepted: 'USD',
    paymentAccepted: 'Cash, Credit Card, Debit Card',
    address: postalAddress,
    geo: geoCoordinates,
    hasMap: MAPS_URL,
    sameAs: [SITE.facebook, SITE.instagram],
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

export function eventSchema(e: EventConfig = NEXT_EVENT) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${SITE_URL}/#event-${e.slug}`,
    name: `${e.name} at ${SITE.name}`,
    description: `${e.blurb} Food trucks, vendor booths and live music at ${SITE.name}, ${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state}. Admission is free. Parking on the lot opens at kickoff for $10 per vehicle.`,
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

export function homeSchemaGraph(email: string = SITE.email) {
  return [
    organizationSchema(email),
    websiteSchema(),
    localBusinessSchema(email),
    ...UPCOMING_EVENTS.map((e) => eventSchema(e)),
    faqSchema(),
    breadcrumbSchema(),
  ];
}
