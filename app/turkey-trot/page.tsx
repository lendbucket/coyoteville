import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import StringLights from '@/components/StringLights';
import RaceAdLoop from '@/components/race/RaceAdLoop';
import RaceDocuments from '@/components/race/RaceDocuments';
import RaceRegistration from '@/components/race/RaceRegistration';
import {
  RACE_H1,
  raceDescription,
  RACE_OG_IMAGE,
  RACE_SUBHEAD,
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
import { HAS_LOGO, HAS_VIDEO, RACE_ASSETS } from '@/lib/race-assets';
import { COURSE_MAP, COURSE_PNG, COURSE_PNG_SIZE, HAS_COURSE_PNG } from '@/lib/race-course';
import { getRaceNights } from '@/lib/race-events';
import { RACE_WAIVER_VERSION } from '@/lib/race-waiver/current';
import { PRICING } from '@/lib/seo';
import { clockFor, getPublishedSponsors, getRace, getRaceCounts } from '@/lib/races';
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
   * races.is_published is false while this is being got ready. The page still
   * renders, because it has to be shareable for review and because the health
   * check asks it for a 200, but it is kept out of search until Robert flips
   * the column. A half finished race indexed under the phrase it is supposed to
   * own is worse than not being indexed yet: the first crawl is the one that
   * sets what the page is about.
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
      /* The course map first: it is a route people in Alice recognise, and it
         is the strongest image in the repo. The site card last, so this is
         never a 404.

         There is no poster frame to prefer any more. The dimensions are parsed
         out of the file rather than written down, because they were hand typed
         once already and went silently wrong when the asset behind them
         changed. */
      images: HAS_COURSE_PNG
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

  return (
    <>
      <JsonLd schemas={[raceSchema(race), raceFaqSchema(race, nights.morning?.opens)]} />
      <Nav />

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        <section className="section section--char race__hero">
          <StringLights tone="dark" variant="top" swags={5} sag={26} bulbsPerSwag={7} id="tt-lights" />
          <div className="shell race__heroin">
            {HAS_LOGO ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="race__logo" src={RACE_ASSETS.logo} alt="" width={220} height={220} />
            ) : null}

            <h1 className="race__h1">{RACE_H1}</h1>
            <p className="race__sub">{RACE_SUBHEAD}</p>

            <p className="race__when">
              {dates.startLong} at {dates.startTime}
            </p>

            <p className="lede race__lede">
              A {race.distanceLabel} run through Alice on streets the city closes for the
              morning, starting and finishing at {race.locationName}. The park opens early and
              stays open after, with food trucks running.
            </p>

            <p className="race__cta">
              <a className="btn btn--primary btn--lg" href="#register">
                Register
              </a>
              <a className="btn btn--ghost btn--lg" href="/turkey-trot/sponsors">
                Sponsor the race
              </a>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------- ad */}
        {HAS_VIDEO ? (
          <section className="section section--cream">
            <div className="shell">
              <RaceAdLoop src={RACE_ASSETS.video} logo={HAS_LOGO ? RACE_ASSETS.logo : null} />
            </div>
          </section>
        ) : null}

        {/* --------------------------------------------------------- course */}
        <section className="section" id="course" aria-labelledby="course-title">
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
              <div
                className="race__coursemap"
                dangerouslySetInnerHTML={{ __html: COURSE_MAP }}
              />
            ) : (
              <div className="race__coursemap race__coursemap--soon">
                <p className="race__coursesoon">
                  The course map is being finalised with the city. It goes up here as soon as
                  the closure is signed off, and every runner registered gets it by email.
                </p>
              </div>
            )}

            <p className="formnote">
              The course is {race.distanceLabel} and is not USATF certified, so distances and
              times are not official for any purpose.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- pricing */}
        <section className="section section--cream-deep" id="pricing" aria-labelledby="pricing-title">
          <div className="shell">
            <p className="eyebrow">Entry</p>
            <h2 id="pricing-title">What it costs</h2>

            <p className="lede">
              {window === 'early'
                ? `Early pricing is on now and ends with the shirt deadline.`
                : window === 'regular'
                  ? 'Early pricing has closed. Race day pricing starts on the morning.'
                  : window === 'raceDay'
                    ? 'This is race day pricing.'
                    : 'Registration has closed for this year.'}
            </p>

            <ul className="race__prices">
              <li>
                <b>Adult</b>
                <span>{dollars(adultNow)}</span>
                <i>
                  {dollars(RACE_PRICING.adultEarly)} early, {dollars(RACE_PRICING.adultRegular)}{' '}
                  regular, {dollars(RACE_PRICING.adultRaceDay)} on the day
                </i>
              </li>
              <li>
                <b>Kids {KID_MAX_AGE} and under</b>
                <span>{dollars(RACE_PRICING.kid)}</span>
                <i>Never goes up</i>
              </li>
              <li>
                <b>Family</b>
                <span>{dollars(RACE_PRICING.family)}</span>
                <i>Up to {FAMILY_MAX_RUNNERS} runners, at least one adult, one payment</i>
              </li>
              <li>
                <b>Team or organization</b>
                <span>{dollars(RACE_PRICING.team)} each</span>
                <i>{TEAM_MIN_RUNNERS} runner minimum, the captain pays once</i>
              </li>
              <li>
                <b>Virtual</b>
                <span>{dollars(RACE_PRICING.virtual)}</span>
                <i>Run it anywhere. Shirt and medal included</i>
              </li>
            </ul>

            <p className="race__addons">
              Add ons: shirt {dollars(RACE_ADDONS.shirt)}
              {shirtsOpen ? '' : ', closed for this year'}, name on your bib{' '}
              {dollars(RACE_ADDONS.bibName)}, extra medal {dollars(RACE_ADDONS.extraMedal)},
              reserved parking {dollars(RACE_ADDONS.parkingPass)}, food truck voucher{' '}
              {dollars(RACE_ADDONS.foodVoucher)}.
            </p>

            {!shirtsOpen ? (
              <p className="formnote">
                Shirts are closed for this year. The printer needed the count, and a shirt
                ordered now would not be here in time.
              </p>
            ) : null}
          </div>
        </section>

        {/* ------------------------------------------------------- includes */}
        <section className="section" aria-labelledby="includes-title">
          <div className="shell">
            <p className="eyebrow">Every entry</p>
            <h2 id="includes-title">What you get</h2>
            <ul className="race__includes">
              {ENTRY_INCLUDES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {!race.chipTimed ? (
              <p className="formnote">
                This first year is not chip timed. There are no official results, no splits and
                no finish time awards. Run it for the morning and the medal.
              </p>
            ) : null}
          </div>
        </section>

        {/* -------------------------------------------------------- checkin */}
        <section className="section section--cream" id="packet-pickup" aria-labelledby="pickup-title">
          <div className="shell">
            <p className="eyebrow">Before you run</p>
            <h2 id="pickup-title">Check in and packet pickup</h2>

            {race.packetPickup ? <p className="lede">{race.packetPickup}</p> : null}

            <p className="race__hard">
              Every runner has to be checked in by {dates.checkInTime} for a {dates.startTime} start.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------- food nights */}
        <section className="section" id="vendors" aria-labelledby="nights-title">
          <div className="shell">
            <p className="eyebrow">Two nights for vendors</p>
            <h2 id="nights-title">Food trucks and booths, both days</h2>

            {/* Both nights come off their event rows. They were typed out here
                while the rows were unpublished and getEvents could not see
                them; they published on 2026-10-22. If a row goes missing the
                copy names no date rather than guessing at one, because a
                sentence naming the wrong Friday sends somebody to a closed
                lot. */}
            <p className="lede">
              {nights.pickup && nights.morning ? (
                <>
                  {nights.pickup.weekday} is packet pickup, with trucks and vendors open at{' '}
                  {nights.pickup.opens}. {nights.morning.weekday} they open at{' '}
                  {nights.morning.opens}, breakfast before the start and a full lot when
                  runners come back in.
                </>
              ) : (
                <>
                  Trucks and vendors are open the evening before the race and again on race
                  morning. Dates and times are on the event page.
                </>
              )}
            </p>

            <p className="race__cta">
              {/* Both prices off PRICING, which is the number Square charges.
                  They were typed out as $65 and $35; the $65 matched and the
                  $35 did not match anything, because the booth price is $25
                  site wide and there is no event specific price to read. A
                  page quoting a price checkout will not honour is worse than
                  a page quoting a lower one. */}
              {nights.pickup ? (
                <a className="btn btn--primary" href={nights.pickup.signupHref}>
                  Book {nights.pickup.weekday}
                </a>
              ) : null}
              {nights.morning ? (
                <a className="btn btn--primary" href={nights.morning.signupHref}>
                  Book {nights.morning.weekday}
                </a>
              ) : null}
              <a className="btn btn--ghost" href="/#apply">
                Food truck {PRICING.truck.price}, vendor booth {PRICING.booth.price}
              </a>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- sponsors */}
        <section className="section section--cream-deep" id="sponsors" aria-labelledby="sponsors-title">
          <div className="shell">
            <p className="eyebrow">Sponsors</p>
            <h2 id="sponsors-title">The businesses putting this on</h2>

            {sponsors.length ? (
              <ul className="race__sponsors">
                {sponsors.map((s) => (
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
            ) : (
              <p className="lede">
                Sponsor spots are open. Put your business on the shirt every runner wears home,
                on the start line, and in front of a few hundred people on a Saturday morning.
              </p>
            )}

            <p className="race__cta">
              <a className="btn btn--primary" href="/turkey-trot/sponsors">
                See the sponsorship levels
              </a>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ faq */}
        <section className="section" id="faq" aria-labelledby="faq-title">
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
        {/* ------------------------------------------------- the documents */}

        {/* Rendered here, by the server, as a sibling of the form and outside
            any client boundary. It used to live inside RaceRegistration, which
            is a client component because it owns form state, so the whole
            forty thousand character instrument was being serialized into the
            bundle. Passing it down as children or a prop would have moved the
            same bytes into the flight payload instead. */}
        <section
          className="section section--char"
          id="documents"
          aria-labelledby="documents-title"
        >
          <div className="shell">
            <p className="eyebrow">What you are signing</p>
            <h2 id="documents-title">The documents</h2>
            <RaceDocuments />
          </div>
        </section>

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
      </main>

      <Footer />
    </>
  );
}
