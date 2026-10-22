import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import StringLights from '@/components/StringLights';
import RaceAdLoop from '@/components/race/RaceAdLoop';
import CourseMapReveal from '@/components/race/CourseMapReveal';
import StickyRegister from '@/components/race/StickyRegister';
import RaceCountdown from '@/components/race/RaceCountdown';
import StripeBand from '@/components/race/StripeBand';
import RaceRegistration from '@/components/race/RaceRegistration';
import {
  RACE_H1,
  raceDescription,
  RACE_OG_IMAGE,
  RACE_TITLE,
  raceFaq,
  raceFaqSchema,
  raceSchema,
} from '@/lib/race-seo';
import {
  ENTRY_INCLUDES,
  RACE_ADDONS,
  RACE_PRICING,
  RACE_SLUG,
  FAMILY_MAX_RUNNERS,
  TEAM_MIN_RUNNERS,
  KID_MAX_AGE,
  dollars,
  priceWindowAt,
  registrationOpenAt,
  shirtsAvailableAt,
} from '@/lib/race';
import { HAS_LOGO, HAS_OG, HAS_VIDEO, OG_SIZE, RACE_ASSETS } from '@/lib/race-assets';
import { COURSE_MAP, COURSE_PNG, COURSE_PNG_SIZE, HAS_COURSE_PNG } from '@/lib/race-course';
import { getRaceNights } from '@/lib/race-events';
import { SPONSOR_LEVELS } from '@/lib/race-sponsorship';
import { RACE_WAIVER_VERSION } from '@/lib/race-waiver/current';
import { PRICING } from '@/lib/seo';
import {
  clockFor,
  getPublishedSponsors,
  getRace,
  getRaceCounts,
  getSponsorStanding,
} from '@/lib/races';
import { raceDates } from '@/lib/race-dates';
import { OG_IMAGE, SITE_URL } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

/**
 * The Turkey Trot.
 *
 * ISR at sixty seconds. The page has to show how full the race is and which
 * price window the clock is on, and both move; a minute old is fine and a
 * static page that says "early pricing" the day after it ended is not.
 */
export const revalidate = 60;

const CANONICAL = `${SITE_URL}/turkey-trot`;

export async function generateMetadata(): Promise<Metadata> {
  const race = await getRace(RACE_SLUG);
  const description = raceDescription(race);

  /**
   * Published decides indexing, not whether the page exists.
   *
   * While races.is_published is false the page still renders, because it has
   * to be shareable for review and because the health check asks it for a 200,
   * but it is kept out of search. A half finished race indexed under the phrase
   * it is supposed to own is worse than not being indexed yet: the first crawl
   * is the one that sets what the page is about. Once the column is true the
   * page indexes complete on that first crawl.
   *
   * Which it is right now is not something this file knows or should state. It
   * reads the column and behaves accordingly.
   */
  const unpublished = !race?.isPublished;

  return {
    title: { absolute: RACE_TITLE },
    description: description,
    alternates: { canonical: CANONICAL },
    ...(unpublished ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: RACE_TITLE,
      description: description,
      url: CANONICAL,
      type: 'website',
      /* The share card first.

         A 1200x630 image made for this, which is what a feed wants. The course
         map was the fallback and looked wrong as a card: it is a wide dark
         diagram, legible on a page and unreadable as a thumbnail. The poster
         frame is next, then the map, then the site card, so this is never a
         404.

         Dimensions are parsed off whichever file wins rather than written
         down, because they were typed once and went silently wrong. */
      images: HAS_OG
        ? [{ url: `${SITE_URL}${RACE_ASSETS.og}`, ...(OG_SIZE ?? {}) }]
        : HAS_COURSE_PNG
          ? [{ url: `${SITE_URL}${COURSE_PNG}`, ...(COURSE_PNG_SIZE ?? {}) }]
          : [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: RACE_TITLE,
      description: description,
    },
  };
}

export default async function TurkeyTrotPage() {
  const race = await getRace(RACE_SLUG);

  if (!race) {
    return (
      <>
        <Nav />
        <main className="section" id="main">
          <div className="shell">
            <h1>{RACE_H1}</h1>
            <p className="lede">
              Details are not loading right now. Email{' '}
              <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a> and we will send them.
            </p>
          </div>
      </main>
        <Footer />
      </>
    );
  }

  const clock = clockFor(race);
  const now = Date.now();
  const counts = await getRaceCounts(race);
  const sponsors = await getPublishedSponsors(race.slug);
  /* The two vendor nights, off their own rows in events. */
  const nights = await getRaceNights();
  /* What is still open, for the sponsors block. Counting already lives in
     getSponsorStanding, which the Race tab uses too. */
  const standing = await getSponsorStanding(race.slug);
  /* What is still open, for the sponsors block. Counting is already done in
     getSponsorStanding, which the Race tab uses too. */

  /* Every human date on this page, derived from the columns. Nothing here
     prints one by hand. */
  const dates = raceDates(race, now);

  const window = priceWindowAt(clock, now);
  const shirtsOpen = shirtsAvailableAt(clock, now);
  const registrationOpen = registrationOpenAt(clock, now);
  const faq = raceFaq(race, nights.morning?.opens);

  const adultNow =
    window === 'early'
      ? RACE_PRICING.adultEarly
      : window === 'regular'
        ? RACE_PRICING.adultRegular
        : RACE_PRICING.adultRaceDay;

  /* The label every Register button on this page uses. One string, one price,
     read from the clock the checkout charges on, so the four of them cannot
     disagree with each other or with the form, and all four change
     themselves when the step does. */
  const registerLabel = registrationOpen
    ? `Register, ${dollars(adultNow)} today`
    : 'Registration is closed';

  return (
    <>
      <JsonLd schemas={[raceSchema(race), raceFaqSchema(race, nights.morning?.opens)]} />
      <Nav />

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        {/* ------------------------------------------------------------ hero

            The video IS the hero: full bleed behind a navy scrim with the type
            over it. The logo on navy is what shows before it loads and what
            reduced motion, saveData and a 2g connection get instead of
            autoplay, so there is no state where this is an empty box.

            There is no separate video section any more. */}
        <section className="racehero">
          {HAS_VIDEO ? (
            <div className="racehero__bg" aria-hidden="true">
              <RaceAdLoop
                src={RACE_ASSETS.video}
                logo={HAS_LOGO ? RACE_ASSETS.logo : null}
                variant="hero"
              />
            </div>
          ) : (
            /* No video in the repo: the logo on navy is the hero on its own. */
            <div className="racehero__bg racehero__bg--still" aria-hidden="true">
              {HAS_LOGO ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={RACE_ASSETS.logo} alt="" className="racehero__stilllogo" />
              ) : null}
            </div>
          )}

          {/* Over the scrim, under the type. */}
          <StringLights
            tone="dark"
            variant="top"
            swags={5}
            sag={26}
            bulbsPerSwag={7}
            id="tt-lights"
          />

          <div className="shell racehero__in">
            {HAS_LOGO ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="racehero__logo"
                src={RACE_ASSETS.logo}
                alt=""
                width={1456}
                height={1080}
              />
            ) : null}

            <h1 className="racehero__h1">{RACE_H1}</h1>

            {/* The date as a block, not a sentence. People decide on the date
                before they read a word of the copy, and every part of it comes
                off starts_at through lib/race-dates. */}
            <p className="racedate">
              <span className="racedate__day">{dates.startWeekdayOnly}</span>
              <span className="racedate__big">{dates.startMonthDay}</span>
              <span className="racedate__time">{dates.startTime}</span>
            </p>

            <p className="racehero__cta">
              <a className="btn btn--primary btn--lg" href="#register">
                {registerLabel}
              </a>
              <a className="btn btn--ghost btn--lg" href="/turkey-trot/sponsors">
                Sponsor the race
              </a>
            </p>

            {/* The countdown already on the home and fundraiser pages, pointed
                at starts_at. Not a second one. */}
            <RaceCountdown targetMs={Date.parse(race.startsAtISO)} serverNowMs={now} />
          </div>
        </section>

        <StripeBand />
        {/* --------------------------------------------------------- course */}
        {/* The map is navy artwork, so it sits in a navy section with no card
            and no seam. Full bleed: a white box around it would be a frame
            around a frame. */}
        <section className="section section--navy race__coursesec" id="course" aria-labelledby="course-title">
          <div className="shell">
            <p className="eyebrow">The course</p>
            <h2 id="course-title">{race.distanceLabel}, out and back through town</h2>

            <p className="lede">
              The route starts and finishes at {race.locationName}. The city closes the streets
              on it for the morning, and there are volunteers and officers at every turn.
            </p>

            {COURSE_MAP ? (
              /* Inlined, not an img. The draw animation and the reduced motion
                 media query both live inside the file, and an img tag would
                 isolate both: the route would never draw and the reduced
                 motion rule would never reach anybody who needs it.

                 The file already carries role="img" and an aria-label
                 describing the course in words, so this wrapper adds no role,
                 no label and no heading of its own. A second announcement
                 would make a screen reader read the route twice. */
              <>
                <div
                  id="course-map"
                  className="race__coursemap"
                  dangerouslySetInnerHTML={{ __html: COURSE_MAP }}
                />
                {/* Starts the draw when the map is in view, once. Renders
                    nothing and takes nothing: it finds the container by id, so
                    the inlined SVG stays server rendered markup rather than
                    becoming a prop or a child of a client component. */}
                <CourseMapReveal targetId="course-map" />
              </>
            ) : (
              <div className="race__coursemap race__coursemap--soon">
                <p className="race__coursesoon">
                  The course map is being finalised with the city. It goes up here as soon as
                  the closure is signed off, and every runner registered gets it by email.
                </p>
              </div>
            )}

          </div>
        </section>

        {/* -------------------------------------------------------- pricing */}
        <section className="section section--cream" id="pricing" aria-labelledby="pricing-title">
          <div className="shell shell--wide">
            <p className="eyebrow">Entry</p>
            <h2 id="pricing-title">What it costs</h2>

            {/* The reason to act today, at a size that says so. Derived from
                shirt_deadline_at, never typed: the early price and the shirt
                deadline are the same instant, and that is the column. */}
            {window === 'early' ? (
              <p className="race__urgent">
                The price goes up after {dates.shirtDeadlineLong}.
              </p>
            ) : window === 'regular' ? (
              <p className="race__urgent">
                Early pricing closed on {dates.shirtDeadlineLong}. Race day costs more again.
              </p>
            ) : null}

            {/* The adult price as a ladder, because the escalation is the
                argument and a table hides it. Which step is live comes from
                the same clock the form charges on, so the page and the
                checkout cannot disagree. */}
            <ol className="ladder" aria-label="Adult entry price by date">
              {[
                {
                  key: 'early',
                  cents: RACE_PRICING.adultEarly,
                  when: `Through ${dates.shirtDeadlineShort}`,
                },
                {
                  key: 'regular',
                  cents: RACE_PRICING.adultRegular,
                  when: `After ${dates.shirtDeadlineShort}`,
                },
                {
                  key: 'raceDay',
                  cents: RACE_PRICING.adultRaceDay,
                  when: 'Race day',
                },
              ].map((step) => (
                <li
                  key={step.key}
                  className="ladder__step"
                  data-live={window === step.key ? 'yes' : 'no'}
                >
                  <span className="ladder__price">{dollars(step.cents)}</span>
                  <span className="ladder__when">{step.when}</span>
                  {window === step.key ? (
                    <span className="ladder__now">On now</span>
                  ) : null}
                </li>
              ))}
            </ol>

            <div className="tiers">
              <div className="tier">
                <span className="tier__price">{dollars(RACE_PRICING.kid)}</span>
                <h3 className="tier__name">Kids {KID_MAX_AGE} and under</h3>
                <p className="tier__note">Never goes up.</p>
              </div>
              <div className="tier">
                <span className="tier__price">{dollars(RACE_PRICING.family)}</span>
                <h3 className="tier__name">Family</h3>
                <p className="tier__note">
                  Up to {FAMILY_MAX_RUNNERS} runners, at least one adult, one payment.
                </p>
              </div>
              <div className="tier">
                <span className="tier__price">{dollars(RACE_PRICING.team)}</span>
                <h3 className="tier__name">Team or organization</h3>
                <p className="tier__note">
                  Each. {TEAM_MIN_RUNNERS} runner minimum, the captain pays once.
                </p>
              </div>
            </div>

            {/* Three add ons and the donation. The name on the bib and the food
                truck voucher were retired on 2026-10-22 and the database
                refuses both, so they are not offered and not priced. */}
            <p className="race__addons">
              Add ons: shirt {dollars(RACE_ADDONS.shirt)}
              {shirtsOpen ? '' : ', closed for this year'}, extra medal{' '}
              {dollars(RACE_ADDONS.extraMedal)}, reserved parking{' '}
              {dollars(RACE_ADDONS.parkingPass)}. A donation of any amount is optional.
            </p>

            {!shirtsOpen ? (
              <p className="formnote">
                Shirts are closed for this year. The printer needed the count, and a shirt
                ordered now would not be here in time.
              </p>
            ) : null}
          </div>
        </section>

        <StripeBand />
        {/* ------------------------------------------------------- includes */}
        <section className="section section--navy" aria-labelledby="includes-title">
          <div className="shell">
            <p className="eyebrow">Every entry</p>
            <h2 id="includes-title">What you get</h2>

            {/* Three things, set large. The list came off ENTRY_INCLUDES and
                still does: the copy is the constant, only the setting is new. */}
            <ol className="getlist">
              {ENTRY_INCLUDES.map((line, i) => (
                <li key={line} className="getlist__item">
                  <span className="getlist__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="getlist__text">{line}</span>
                </li>
              ))}
            </ol>

            {!race.chipTimed ? (
              <p className="formnote">
                This first year is not chip timed. There are no official results, no splits and
                no finish time awards. Run it for the morning and the medal.
              </p>
            ) : null}
            {/* Somebody who has read this far should not have to scroll back
                up to act. */}
            <p className="race__cta">
              <a className="btn btn--primary btn--lg" href="#register">
                {registerLabel}
              </a>
            </p>
          </div>
        </section>

        <StripeBand />
        <StripeBand />

        {/* -------------------------------------------------------- checkin */}
        <section className="section section--cream" id="packet-pickup" aria-labelledby="pickup-title">
          <div className="shell">
            <p className="eyebrow">Before you run</p>
            <h2 id="pickup-title">Check in and packet pickup</h2>

            {race.packetPickup ? <p className="lede">{race.packetPickup}</p> : null}

            <p className="race__hard">
              Every runner has to be checked in by {dates.checkInTime} for a {dates.startTime} start.
            </p>
            {/* Somebody who has read this far should not have to scroll back
                up to act. */}
            <p className="race__cta">
              <a className="btn btn--primary btn--lg" href="#register">
                {registerLabel}
              </a>
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------- food nights */}
        {/* The turkey accent is the logo the brand already has, set as a
            custom property here rather than hardcoded in the stylesheet, so
            it is gated on the asset existing the same way everything else
            is. No logo, no accent, and the section is just warm. */}
        <section
          className="section section--harvest"
          id="vendors"
          aria-labelledby="nights-title"
          style={
            HAS_LOGO
              ? ({ ['--tt-mark']: `url(${RACE_ASSETS.logo})` } as React.CSSProperties)
              : undefined
          }
        >
          <div className="shell">
            <p className="eyebrow">Both days</p>
            <h2 id="nights-title">There is food either side of this race</h2>

            {nights.pickup && nights.morning ? (
              <>
                <p className="lede">
                  {nights.pickup.weekday} is packet pickup and a food truck night. Come down
                  from {nights.pickup.opens}, get your bib, and stay for dinner. You do not
                  have to be running to eat.
                </p>

                <p className="lede">
                  {nights.morning.weekday} the trucks open at {nights.morning.opens}, two
                  hours before the gun. Breakfast tacos and coffee while it is still dark,
                  and the whole lot open again when runners come back in. Bring the people
                  who came to watch. They will want somewhere to sit and something to eat
                  while they wait.
                </p>
              </>
            ) : (
              <p className="lede">
                The trucks are open the evening before the race and again on race morning,
                before the start and after the finish. Dates and times are on the event
                page.
              </p>
            )}

            {/* The vendor line, demoted. It is for the handful of operators
                reading this, not for the runners the section is written for. */}
            <p className="race__vendorline">
              Selling food or running a booth?{' '}
              {nights.pickup ? (
                <a href={nights.pickup.signupHref}>Book {nights.pickup.weekday}</a>
              ) : null}
              {nights.pickup && nights.morning ? ' or ' : null}
              {nights.morning ? (
                <a href={nights.morning.signupHref}>book {nights.morning.weekday}</a>
              ) : null}
              . Food truck {PRICING.truck.price}, vendor booth {PRICING.booth.price}.
            </p>
          </div>
        </section>

        <StripeBand />

        {/* ------------------------------------------------------- sponsors */}
        {/* The sponsors block reads as an offer rather than a footnote: what
            is still open, at what price, with the sold levels marked rather
            than hidden. Counts come from getSponsorStanding, so a level that
            sells says so without anybody editing the page. */}
        <section
          className="section section--cream-deep"
          id="sponsors"
          aria-labelledby="sponsors-title"
        >
          <div className="shell shell--wide">
            <p className="eyebrow">Sponsors</p>
            <h2 id="sponsors-title">Put your name on this race</h2>

            {sponsors.length ? (
              <ul className="race__sponsors">
                {sponsors.map((sp) => (
                  <li key={sp.id}>
                    {sp.website ? (
                      <a href={sp.website} target="_blank" rel="noreferrer noopener">
                        {sp.businessName}
                      </a>
                    ) : (
                      <span>{sp.businessName}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="lede">
              Your business on the shirt every runner wears home, on the start line, and in
              front of a few hundred people on a Saturday morning in Alice.
            </p>

            <ul className="offers">
              {SPONSOR_LEVELS.map((level) => {
                const taken = standing.takenByLevel[level.id] ?? 0;
                const left = Math.max(0, level.slots - taken);
                return (
                  <li key={level.id} className="offer" data-sold={left === 0 ? 'yes' : 'no'}>
                    <span className="offer__price">{dollars(level.cents)}</span>
                    <span className="offer__name">{level.name}</span>
                    <span className="offer__state">
                      {left === 0 ? 'Sold' : left === level.slots ? 'Open' : `${left} left`}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="race__cta">
              <a className="btn btn--primary btn--lg" href="/turkey-trot/sponsors">
                See what each level includes
              </a>
            </p>
          </div>
        </section>

        <StripeBand />
        {/* ------------------------------------------------------------ faq */}
        <section className="section section--cream" id="faq" aria-labelledby="faq-title">
          <div className="shell">
            <p className="eyebrow">Questions</p>
            <h2 id="faq-title">Before you ask</h2>
            <dl className="race__faq">
              {faq.map((item) => (
                <div key={item.q}>
                  <dt>{item.q}</dt>
                  <dd>{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------------- register */}
        <section className="section section--char" id="register" aria-labelledby="register-title">
          <div className="shell">
            <p className="eyebrow">Register</p>
            <h2 id="register-title">Get your place</h2>

            <RaceRegistration
              raceSlug={race.slug}
              clock={clock}
              nowMs={now}
              full={counts.full}
              remaining={counts.remaining}
              closed={!registrationOpen}
              morningOpens={nights.morning?.opens}
              waiverVersion={RACE_WAIVER_VERSION}
            />
          </div>
        </section>
        {/* Phones only. Appears once the hero has gone and hides again when
            the form is on screen, because a bar covering the button it points
            at is just a bar over a button. */}
        <StickyRegister label={registerLabel} />
      </main>

      <Footer />
    </>
  );
}
