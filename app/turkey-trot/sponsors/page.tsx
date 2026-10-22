import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import StripeBand from '@/components/race/StripeBand';
import StringLights from '@/components/StringLights';
import { HAS_LOGO, HAS_OG, OG_SIZE, RACE_ASSETS } from '@/lib/race-assets';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import SponsorForm from '@/components/race/SponsorForm';
import { sponsorDescription, SPONSOR_TITLE } from '@/lib/race-seo';
import { RACE_SLUG, dollars } from '@/lib/race';
import { SPONSOR_LEVELS, availabilityFor } from '@/lib/race-sponsorship';
import { getPublishedSponsors, getRace, getSponsorStanding } from '@/lib/races';
import { OG_IMAGE, SITE, SITE_URL } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

/**
 * The page that funds the event.
 *
 * ISR at sixty seconds, like the race page, because what is left at each level
 * changes and a sold title sponsorship still on sale is the one mistake this
 * page cannot make.
 */
export const revalidate = 60;

const CANONICAL = `${SITE_URL}/turkey-trot/sponsors`;

export async function generateMetadata(): Promise<Metadata> {
  const race = await getRace(RACE_SLUG);

  /* Same rule as the race page. This is the one Robert sends to businesses by
     direct link this week, so it has to render and be right before it is
     indexed, and it indexes complete on the first crawl once he publishes. */
  const unpublished = !race?.isPublished;
  const description = sponsorDescription(race);

  return {
    title: { absolute: SPONSOR_TITLE },
    description: description,
    alternates: { canonical: CANONICAL },
    ...(unpublished ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: SPONSOR_TITLE,
      description: description,
      url: CANONICAL,
      type: 'website',
      /* The share card made for this, 1200x630, with its size read off the
         file. Falls back to the site card so this is never a 404. */
      images: HAS_OG
        ? [{ url: `${SITE_URL}${RACE_ASSETS.og}`, ...(OG_SIZE ?? {}) }]
        : [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: SPONSOR_TITLE,
      description: description,
      images: HAS_OG ? [`${SITE_URL}${RACE_ASSETS.og}`] : [OG_IMAGE],
    },
  };
}

export default async function SponsorsPage() {
  const race = await getRace(RACE_SLUG);

  if (!race) {
    return (
      <>
        <Nav />
        <main className="section" id="main">
          <div className="shell">
            <h1>Turkey Trot sponsorship</h1>
            <p className="lede">
              Details are not loading right now. Email{' '}
              <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a> and we will send the
              sponsorship sheet.
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const standing = await getSponsorStanding(race.slug);
  const availability = availabilityFor(SPONSOR_LEVELS, standing.takenByLevel);
  const published = await getPublishedSponsors(race.slug);

  const shirtDeadlineMs = Date.parse(race.shirtDeadlineAtISO);
  const shirtDeadlinePassed = Date.now() > shirtDeadlineMs;
  const shirtDeadlineLabel = new Date(shirtDeadlineMs).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric',
  });

  /* An Offer per level, built from the same constants the page renders. A
     sponsorship is a thing somebody buys, and a crawler that can see the price
     and whether it is still available is a crawler that can surface it. */
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: `${race.name} sponsorship`,
    url: CANONICAL,
    provider: { '@type': 'Organization', name: SITE.name, url: SITE_URL },
    itemListElement: availability.map(({ level, soldOut }) => ({
      '@type': 'Offer',
      name: level.name,
      price: (level.cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      url: `${CANONICAL}#apply`,
    })),
  };

  return (
    <>
      <JsonLd schemas={[schema]} />
      <Nav />

      <main id="main">
        {/* Same treatment as the race page: the logo on navy, big, with the
            type over it. No video here; the logo is the artwork. */}
        <section className="racehero racehero--sponsor">
          <div className="racehero__bg racehero__bg--still" aria-hidden="true">
            {HAS_LOGO ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={RACE_ASSETS.logo} alt="" className="racehero__stilllogo" />
            ) : null}
          </div>

          <StringLights
            tone="dark"
            variant="top"
            swags={4}
            sag={24}
            bulbsPerSwag={7}
            id="tts-lights"
          />

          <div className="shell racehero__in">
            <p className="eyebrow">Sponsorship</p>
            <h1 className="racehero__h1">Turkey Trot sponsorship, Alice TX</h1>
            <p className="lede racehero__lede">
              A few hundred people on a Saturday morning in November, running past your name on
              streets the city closes for them, and wearing your logo home. This is the first
              annual, so whoever puts their name on it now is the business this race is
              associated with for as long as it runs.
            </p>

            {/* The shirt deadline as the urgency it is, derived from
                shirt_deadline_at rather than typed. */}
            {!shirtDeadlinePassed ? (
              <p className="race__urgent race__urgent--onnavy">
                Shirt placement closes {shirtDeadlineLabel}.
              </p>
            ) : null}

            <p className="racehero__cta">
              <a className="btn btn--primary btn--lg" href="#apply">
                Pick a level
              </a>
              <a className="btn btn--ghost btn--lg" href="/turkey-trot">
                The race
              </a>
            </p>
          </div>
        </section>

        <StripeBand />
        {/* ---------------------------------------------------------- levels */}
        {/* A descending price ladder. SPONSOR_LEVELS is already ordered by
            value, so the order is the data rather than a decision here, and
            a sold level is marked rather than hidden. */}
        <section className="section section--cream" aria-labelledby="levels-title">
          <div className="shell shell--wide">
            <p className="eyebrow">The levels</p>
            <h2 id="levels-title">What is available</h2>

            <ol className="slad">
              {availability.map(({ level, remaining, soldOut }) => (
                <li
                  key={level.id}
                  className="slad__level"
                  data-sold={soldOut ? 'yes' : 'no'}
                  data-feature={level.feature ? 'yes' : 'no'}
                >
                  <div className="slad__head">
                    <span className="slad__price">{dollars(level.cents)}</span>
                    <div className="slad__id">
                      <h3 className="slad__name">{level.name}</h3>
                      <p className="slad__left">
                        {soldOut
                          ? 'Sold'
                          : level.slots === 1
                            ? 'One available'
                            : `${remaining} of ${level.slots} available`}
                      </p>
                    </div>
                  </div>

                  <ul className="slad__benefits">
                    {level.benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>

            <p className="formnote">
              {shirtDeadlinePassed
                ? 'The shirt order has gone to the printer, so no new sponsorship can include shirt placement this year. Everything else at every level is unchanged.'
                : `Shirt placement depends on the shirt order going to the printer on ${shirtDeadlineLabel}. A sponsorship paid after that date gets everything else at its level and a substitute of comparable value, which is in the agreement before you pay rather than after.`}
            </p>
          </div>
        </section>

        <StripeBand />
        {/* ------------------------------------------------------ who is in */}
        {published.length ? (
          <section className="section section--cream" aria-labelledby="already-title">
            <div className="shell">
              <h2 id="already-title">Already in</h2>
              <ul className="race__sponsors">
                {published.map((s) => (
                  <li key={s.id}>
                    {s.website ? (
                      <a href={s.website} target="_blank" rel="noreferrer noopener">
                        {s.businessName}
                      </a>
                    ) : (
                      <span>{s.businessName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ----------------------------------------------------------- apply */}
        <section className="section section--char" id="apply" aria-labelledby="apply-title">
          <div className="shell">
            <p className="eyebrow">Apply</p>
            <h2 id="apply-title">Put your name on it</h2>

            <SponsorForm
              raceSlug={race.slug}
              availability={availability}
              shirtDeadlineLabel={shirtDeadlineLabel}
              shirtDeadlinePassed={shirtDeadlinePassed}
            />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
