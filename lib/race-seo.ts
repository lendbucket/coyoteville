import { ADDRESS, GEO, SITE, SITE_URL } from './seo';
import {
  RACE_ADDONS,
  RACE_DISTANCE,
  RACE_NAME,
  RACE_PHRASE,
  RACE_PRICING,
  dollars,
} from './race';
import type { Race } from './races';

/**
 * One source for the title, the description and the H1.
 *
 * They cannot be allowed to drift. A page whose heading says one thing and
 * whose title tag says another is a page a search engine has to guess about,
 * and the guess is never in our favour. So the phrase is a constant, the three
 * strings are built from it here, and the page imports them rather than writing
 * its own.
 *
 * Everything else on this page can be rewritten freely. These four exports are
 * the ones to leave alone.
 */

/**
 * Exactly what the title tag says, and nothing appended to it.
 *
 * The layout has a title template that adds "| Coyoteville" to every page.
 * Here that produced three segments and 70 characters, which Google truncates,
 * and the part it truncates is the end. The page sets this absolute so the
 * template does not get a say: the brand is already in the second segment.
 */
export const RACE_TITLE = 'Alice TX Turkey Trot 2026 | Coyoteville 1st Annual 5K';

/**
 * The H1, which leads with the phrase.
 *
 * "Alice TX Turkey Trot" first, then what it is. A heading that opens with the
 * brand and buries the phrase reads better to us and worse to everybody
 * searching for a turkey trot near Alice, which is the entire audience.
 */
export const RACE_H1 = `Alice TX Turkey Trot 2026`;

/** Under the H1, carrying the name the event is actually called. */
export const RACE_SUBHEAD = `The ${RACE_NAME}`;

/**
 * The meta description.
 *
 * Under 160 characters, leads with the phrase, carries the date and the
 * distance, and says the one thing that makes somebody click: it is the first
 * one.
 */
export const RACE_DESCRIPTION =
  `The ${RACE_PHRASE} is back for its first year. A ${RACE_DISTANCE} run through ` +
  `Alice on Saturday, November 14, 2026 at 8:00 AM, starting and finishing at Coyoteville.`;

/** The sponsors page, which targets its own phrase. */
export const SPONSOR_TITLE = 'Turkey Trot Sponsorship, Alice TX | Coyoteville';
export const SPONSOR_DESCRIPTION =
  'Sponsor the Alice TX Turkey Trot. Put your business on the shirt, the start ' +
  'line and the course of the first annual Coyoteville Turkey Trot, November 14, 2026.';

/**
 * The social card.
 *
 * The poster frame off the ad, not the logo. A still of a person running reads
 * as an event in a feed; a logo on white reads as nothing and gets scrolled
 * past. Falls back to the site card when the poster is not in the repo yet, so
 * a missing file is a worse card rather than a broken one.
 */
export const RACE_OG_IMAGE = '/video/turkey-trot-ad-poster.jpg';

/* ------------------------------------------------------- structured data */

/**
 * SportsEvent, with an offer per tier.
 *
 * The offers are derived from the pricing constants rather than typed again
 * here. A price that is right on the page and wrong in the structured data is
 * the version of this bug that nobody notices, because the only thing that
 * reads it is a crawler.
 *
 * eventStatus and eventAttendanceMode are stated rather than left out: a race
 * that was cancelled or moved online in 2020 taught every crawler to expect
 * them, and omitting them reads as an unmaintained listing.
 */
export function raceSchema(race: Race) {
  const offer = (name: string, cents: number) => ({
    '@type': 'Offer',
    name,
    price: (cents / 100).toFixed(2),
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: `${SITE_URL}/turkey-trot#register`,
    validThrough: race.registrationClosesAtISO,
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: race.name,
    /* The phrase, in the one field a crawler reads as prose. */
    description: RACE_DESCRIPTION,
    sport: 'Running',
    startDate: race.startsAtISO,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: `${SITE_URL}/turkey-trot`,
    image: [`${SITE_URL}${RACE_OG_IMAGE}`],
    location: {
      '@type': 'Place',
      name: race.locationName,
      address: {
        '@type': 'PostalAddress',
        streetAddress: ADDRESS.street,
        addressLocality: ADDRESS.city,
        addressRegion: ADDRESS.stateCode,
        postalCode: ADDRESS.zip,
        addressCountry: ADDRESS.country,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: GEO.latitude,
        longitude: GEO.longitude,
      },
    },
    organizer: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE_URL,
      telephone: SITE.telephone,
    },
    offers: [
      offer('Adult entry, early', RACE_PRICING.adultEarly),
      offer('Adult entry, regular', RACE_PRICING.adultRegular),
      offer('Adult entry, race day', RACE_PRICING.adultRaceDay),
      offer('Kids 12 and under', RACE_PRICING.kid),
      offer('Family, up to five runners', RACE_PRICING.family),
      offer('Team, per runner', RACE_PRICING.team),
      offer('Virtual entry', RACE_PRICING.virtual),
    ],
  };
}

/**
 * The questions, in one place.
 *
 * The page renders this array and the FAQPage schema is built from the same
 * array, so the structured data cannot describe a question the page does not
 * ask. Google penalises exactly that mismatch and it is invisible to look at.
 */
export function raceFaq(race: Race): { q: string; a: string }[] {
  return [
    {
      q: 'When and where is the Alice TX Turkey Trot?',
      a: `Saturday, November 14, 2026 at ${race.displayTime}. It starts and finishes at ${race.locationName}, ${race.locationAddress}. The city closes the streets on the route for the morning.`,
    },
    {
      q: 'How long is the course?',
      a: `It is ${race.distanceLabel}. The course is not USATF certified, so distances and times are not official for any purpose.`,
    },
    {
      q: 'Is the race chip timed?',
      a: race.chipTimed
        ? 'Yes. Every runner is chip timed and results are posted after the race.'
        : 'No. This first year is not chip timed, so there are no official results, splits or finish time awards. Run it for the morning and the medal.',
    },
    {
      q: 'What does it cost to enter?',
      a: `Adult entry starts at ${dollars(RACE_PRICING.adultEarly)} and goes up as race day gets closer. Kids 12 and under are ${dollars(RACE_PRICING.kid)}. A family of up to five is ${dollars(RACE_PRICING.family)}. A shirt is ${dollars(RACE_ADDONS.shirt)} and has to be ordered before the printer's deadline.`,
    },
    {
      q: 'What time do I need to be there?',
      a: 'Every runner has to be checked in by 7:00 AM for an 8:00 AM start. Packet pickup is the Friday evening before, and again from 6:00 AM on race morning.',
    },
    {
      q: 'Can I pick up a packet for somebody else?',
      a: 'Yes, as long as they have registered and signed the waiver. Bring their name.',
    },
    {
      q: 'What if it rains?',
      a: 'The race goes ahead in rain. We will delay or cancel only for lightning or for a public safety instruction, and entry fees are not refundable either way.',
    },
    {
      q: 'Can I walk it?',
      a: 'Yes. Walkers, strollers and dogs on a short lead are all welcome. Line up at the back so the runners can get out.',
    },
    {
      q: 'What does my entry include?',
      a: 'A bib, a finisher medal, and the park open afterwards with food trucks and coffee. A shirt is a separate add on.',
    },
  ];
}

export function raceFaqSchema(race: Race) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: raceFaq(race).map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
