import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import JsonLd from '@/components/JsonLd';
import OrgApplicationForm, { type GameOption } from '@/components/OrgApplicationForm';
import { FNF_TERMS, FNF_TERMS_VERSION } from '@/lib/fnf-terms';
import {
  PARKING_PRICE_CENTS,
  PAYOUT_WINDOW_DAYS,
  PROGRAM_NAME,
  VOLUNTEER_MINIMUM,
  dollars,
  getGameSlots,
  getPublishedLedger,
} from '@/lib/friday-night-fund';
import { ADDRESS, OG_IMAGE, SITE, SITE_URL } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

/**
 * The Friday Night Fund.
 *
 * ISR at sixty seconds, like the homepage: the ledger and which games are
 * spoken for both change, and neither changes often enough to justify a
 * database round trip per visitor.
 */
export const revalidate = 60;

/* The phrase this page is trying to rank for. Written once so the title, the
   description and the H1 cannot drift apart, which is the usual way a page
   ends up optimised for three slightly different things. */
const TARGET = 'Alice TX Fundraiser';
const TITLE = `${TARGET} for Local Organizations: The ${PROGRAM_NAME}`;
const DESCRIPTION = `An Alice TX fundraiser for schools, booster clubs, teams and nonprofits. Work a Coyoteville home game and your organization keeps 50 percent of the gross parking revenue, paid within ${PAYOUT_WINDOW_DAYS} days.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/friday-night-fund' },
  keywords: [
    'Alice TX fundraiser',
    'Alice Texas fundraiser',
    'fundraiser for schools Alice TX',
    'booster club fundraiser Alice Texas',
    'nonprofit fundraiser Jim Wells County',
    `${PROGRAM_NAME} Coyoteville`,
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: `${SITE_URL}/friday-night-fund`,
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ ...OG_IMAGE, alt: `${PROGRAM_NAME} at Coyoteville` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Who can apply to the Friday Night Fund?',
    a: 'Any Alice area organization: schools and school groups, booster clubs, sports teams, churches, youth organizations, civic clubs and nonprofits. You do not need 501(c)(3) status. You need adults who will turn up.',
  },
  {
    q: 'How much does an organization actually get?',
    a: `50 percent of the gross parking revenue for that game. Gross means every vehicle counted at the gate at ${dollars(PARKING_PRICE_CENTS)} per vehicle, before any expense of any kind is taken out. Nothing is deducted before the split.`,
  },
  {
    q: 'How are organizations chosen?',
    a: 'One organization works each home game, drawn at random from the applications for that game. Until every applicant has had a game, an organization that already has one is left out of the draw.',
  },
  {
    q: 'What does my organization do on the night?',
    a: `Run parking, keep the lot clean during and after the event, and help keep the crowd in good order. You bring at least ${VOLUNTEER_MINIMUM} adults for the whole shift. Someone from Coyoteville is on site the entire time.`,
  },
  {
    q: 'Can students or young people help?',
    a: 'Yes, with a parent or guardian on site for the whole shift. Anyone under 18 does not direct traffic and does not stand in a traffic lane, and does not count toward the adult minimum.',
  },
  {
    q: 'When do we get paid?',
    a: `Within ${PAYOUT_WINDOW_DAYS} days of the game, by check or whatever method we agree. The amount and the parking gross it came from are both published on this page.`,
  },
  {
    q: 'What if it rains?',
    a: 'Events run rain or shine. If a game is shortened or cancelled, the parking revenue is whatever was actually collected and your organization is paid half of it on the same terms. If no parking was collected there is nothing to split and you go back into the draw for a later game.',
  },
  {
    q: 'What happens if we cannot make it?',
    a: `Tell us as early as you can and we will put you back in the draw for a later game. Not turning up on the night, or arriving with fewer than ${VOLUNTEER_MINIMUM} adults, forfeits that game's share in full.`,
  },
];

export default async function FridayNightFundPage() {
  const [slots, ledger] = await Promise.all([getGameSlots(), getPublishedLedger()]);

  const games: GameOption[] = slots.map((s) => ({
    slug: s.event.slug,
    label: `${s.event.name}, ${s.event.displayDate}`,
    taken: s.taken,
  }));

  const support = supportEmail();

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/friday-night-fund#faq`,
      mainEntity: FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${SITE_URL}/friday-night-fund`,
      url: `${SITE_URL}/friday-night-fund`,
      name: TITLE,
      description: DESCRIPTION,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: {
        '@type': 'Place',
        name: `${ADDRESS.city}, ${ADDRESS.state}`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        {
          '@type': 'ListItem',
          position: 2,
          name: PROGRAM_NAME,
          item: `${SITE_URL}/friday-night-fund`,
        },
      ],
    },
  ];

  return (
    <>
      <JsonLd schemas={schemas} />
      {/* Apply points at this page's own form. Sending an organization to the
          vendor application would be sending them to the wrong form. */}
      <Nav applyHref="#apply-fnf" applyLabel="Apply" />

      <main id="main">
        {/* ------------------------------------------------------- hero */}
        <section className="section fnf__hero" aria-labelledby="fnf-title">
          <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={7} id="fnf-lights" />
          <div className="shell">
            <p className="eyebrow">{PROGRAM_NAME}</p>
            <h1 id="fnf-title">{TITLE}</h1>
            <p className="lede">
              Work a Coyoteville home game and your organization keeps half the parking money, paid
              within {PAYOUT_WINDOW_DAYS} days and posted publicly, game by game.
            </p>
            <p>
              <a className="btn btn--rust" href="#apply-fnf">
                Apply to work a game
              </a>
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- how it works */}
        <section className="section" aria-labelledby="fnf-how">
          <div className="shell">
            <p className="eyebrow">How it works</p>
            <h2 id="fnf-how">Four steps, start to finish</h2>
            <ol className="fnf__steps">
              <li>
                <b>Apply.</b> Tell us who you are and which home games you can cover. It takes a few
                minutes.
              </li>
              <li>
                <b>Get picked.</b> One organization works each game, drawn at random from the
                applications for that night. We email you either way.
              </li>
              <li>
                <b>Work the game.</b> Bring {VOLUNTEER_MINIMUM} adults. Run parking, keep the lot
                clean, help keep things in good order.
              </li>
              <li>
                <b>Get paid.</b> Half the gross parking for that game, within {PAYOUT_WINDOW_DAYS}{' '}
                days, with the number posted on this page.
              </li>
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------ what you do */}
        <section className="section section--char" aria-labelledby="fnf-work">
          <div className="shell">
            <p className="eyebrow">On the night</p>
            <h2 id="fnf-work">What your organization actually does</h2>
            <p className="lede">
              This is work, not a bucket by the gate. Here is the whole job.
            </p>
            <ul className="fnf__list">
              <li>
                <b>Run parking.</b> Direct vehicles into the lot, collect{' '}
                {dollars(PARKING_PRICE_CENTS)} per vehicle, and hand every dollar to Coyoteville as
                you collect it. We count it together.
              </li>
              <li>
                <b>Keep the lot clean.</b> Pick up litter across the lot during the event, then walk
                it once more at the end so it is clear before anybody leaves.
              </li>
              <li>
                <b>Help keep the crowd in good order.</b> Friendly presence, point people where they
                are going, keep lanes clear. Anything involving alcohol, a dispute or an injury goes
                straight to Coyoteville staff, never to your volunteers.
              </li>
              <li>
                <b>Bring {VOLUNTEER_MINIMUM} adults.</b> Aged 18 or over, for the whole shift, from
                before gates open until the lot is clear. Someone from Coyoteville is on site the
                entire time.
              </li>
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------- what you get */}
        <section className="section" aria-labelledby="fnf-pay">
          <div className="shell">
            <p className="eyebrow">The money</p>
            <h2 id="fnf-pay">Half the gross parking, and we say what gross means</h2>
            <p className="lede">
              Your organization receives <b>50 percent of the gross parking revenue</b> for the game
              it works.
            </p>
            <p className="formnote" role="note">
              <b>Gross</b> means every vehicle counted at the gate at {dollars(PARKING_PRICE_CENTS)}{' '}
              per vehicle, before any expense of any kind is taken out. Not after costs, not after
              staffing, not after anything. If 300 cars park, the gross is{' '}
              {dollars(300 * PARKING_PRICE_CENTS)} and your organization is paid{' '}
              {dollars((300 * PARKING_PRICE_CENTS) / 2)}.
            </p>
            <p>
              Payment is made within {PAYOUT_WINDOW_DAYS} days of the game. Both the gross and the
              payout are published below, so you can check the arithmetic and so can everybody else.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------- the games */}
        <section className="section section--char" aria-labelledby="fnf-games">
          <div className="shell">
            <p className="eyebrow">This season</p>
            <h2 id="fnf-games">Which games are open</h2>
            {slots.length ? (
              <ul className="fnf__games-list">
                {slots.map((s) => (
                  <li key={s.event.slug} className="fnf__game">
                    <span className="fnf__game-name">{s.event.name}</span>
                    <span className="fnf__game-when">{s.event.displayDate}</span>
                    <span className={`fnf__game-state ${s.taken ? 'is-taken' : 'is-open'}`}>
                      {s.taken ? (s.orgName ? `Worked by ${s.orgName}` : 'Spoken for') : 'Open'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Next season&apos;s dates go up here as soon as they are set.</p>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- the ledger */}
        <section className="section fnf__ledger-section" aria-labelledby="fnf-ledger">
          <div className="shell">
            <p className="eyebrow">The ledger</p>
            <h2 id="fnf-ledger">Every game, every number, posted</h2>
            <p className="lede">
              What was collected and what was paid, for each game once it has been played and
              settled. This is the whole reason to believe any of the above.
            </p>

            {ledger.length ? (
              <div className="fnf__table-wrap">
                <table className="fnf__table">
                  <thead>
                    <tr>
                      <th scope="col">Game</th>
                      <th scope="col">Organization</th>
                      <th scope="col">Parking gross</th>
                      <th scope="col">Paid to the org</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.eventSlug}>
                        <td>
                          <b>{row.eventName}</b>
                          <span className="fnf__cell-sub">{row.eventDate}</span>
                        </td>
                        <td>{row.orgName}</td>
                        <td>{row.parkingGrossCents === null ? 'Not yet posted' : dollars(row.parkingGrossCents)}</td>
                        <td>{row.payoutCents === null ? 'Not yet posted' : dollars(row.payoutCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="fnf__empty">
                Nothing here yet. The first number goes up after the September 11 home game, and
                every game after it.
              </p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------- who can apply */}
        <section className="section section--char" aria-labelledby="fnf-who">
          <div className="shell">
            <p className="eyebrow">Eligibility</p>
            <h2 id="fnf-who">Who can apply</h2>
            <p className="lede">
              Alice area organizations. Schools and school groups, booster clubs, sports teams,
              churches and faith groups, youth organizations, civic and service clubs, and
              nonprofits.
            </p>
            <p>
              <b>501(c)(3) status is not required.</b> A booster club with a bank account and six
              reliable adults is exactly who this is for.
            </p>
            <p>
              Your organization has to bring adults. Anyone under 18 may help with a parent or
              guardian on site for the whole shift, does not direct traffic, and does not count
              toward the {VOLUNTEER_MINIMUM} adult minimum.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------- the rules */}
        <section className="section" aria-labelledby="fnf-rules">
          <div className="shell">
            <p className="eyebrow">The rules</p>
            <h2 id="fnf-rules">Stated plainly, before you apply</h2>
            <ul className="fnf__list">
              <li>One organization per game. No sharing a night between two groups.</li>
              <li>
                The pick is random, drawn from the eligible applicants for that game. Applying does
                not guarantee a game.
              </li>
              <li>
                An organization that does not turn up with at least {VOLUNTEER_MINIMUM} adults at
                the agreed time forfeits that game&apos;s share in full.
              </li>
              <li>
                Every individual volunteer signs a waiver on the night, before they start. We
                provide the form.
              </li>
              <li>
                Coyoteville counts the vehicles and determines what the parking revenue was for the
                game, then publishes it here.
              </li>
              <li>
                This is payment for services at an event. It is not a donation or a grant, and we
                cannot give you a charitable receipt for it.
              </li>
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------- FAQ */}
        <section className="section section--char" id="fnf-faq" aria-labelledby="fnf-faq-title">
          <div className="shell">
            <p className="eyebrow">Questions</p>
            <h2 id="fnf-faq-title">Things organizations ask</h2>
            <div className="faq">
              {FAQ.map((item) => (
                <details className="faq__item" key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- apply */}
        <section className="section fnf__apply" id="apply-fnf" aria-labelledby="fnf-apply-title">
          <StringLights tone="dark" variant="top" swags={5} sag={28} bulbsPerSwag={6} id="fnf-apply-lights" />
          <div className="shell">
            <p className="eyebrow">Apply</p>
            <h2 id="fnf-apply-title">Put your organization in the draw</h2>
            <p className="lede">
              Pick every game you could work. You are only ever drawn for a night you chose.
            </p>
            <OrgApplicationForm
              terms={FNF_TERMS}
              termsVersion={FNF_TERMS_VERSION}
              games={games}
              volunteerMinimum={VOLUNTEER_MINIMUM}
              programName={PROGRAM_NAME}
              supportEmail={support}
            />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
