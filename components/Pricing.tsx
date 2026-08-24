import { PRICING, NEXT_EVENT } from '@/lib/seo';
import { getSpots, type SpotLine } from '@/lib/spots';

/**
 * Vendor spot cards.
 *
 * The "spots left" line on each card is counted out of the database, not
 * written here. When capacity is not set on the event the line is omitted
 * rather than guessed at.
 */

/** Shared terms that apply to booths and trucks alike. */
const BOTH = [
  'One vehicle on the property so the lot does not get crowded',
  'Bring your own table, chairs, canopy and decorations',
  'Bring your Coyote spirit',
];

function spotsLeftLabel(line: SpotLine): string | null {
  if (line.remaining === null) return null;
  if (line.remaining === 0) return 'Full for this event';
  if (line.remaining === 1) return '1 spot left';
  return `${line.remaining} spots left`;
}

export default async function Pricing() {
  const spots = await getSpots(NEXT_EVENT.slug);

  const cards = [
    {
      name: PRICING.booth.label,
      amount: PRICING.booth.price,
      per: 'per event',
      feature: false,
      flag: null as string | null,
      points: [
        'A designated area to set up',
        'Coyote merch, boutiques and crafts',
        'Small businesses and misc vendors',
        ...BOTH,
      ],
      left: spots.available ? spotsLeftLabel(spots.booth) : null,
    },
    {
      name: PRICING.truck.label,
      amount: PRICING.truck.price,
      per: 'per event',
      feature: true,
      flag: spots.available && spots.truck.remaining !== null && spots.truck.remaining <= 3
        ? 'Filling fast'
        : 'Most trucks',
      points: [
        'A designated spot for your truck',
        'Food handler and health permits required',
        'Room to pull in and serve a line',
        ...BOTH,
      ],
      left: spots.available ? spotsLeftLabel(spots.truck) : null,
    },
    {
      name: PRICING.free.label,
      amount: PRICING.free.price,
      per: 'always',
      feature: false,
      flag: null as string | null,
      points: [
        'Alice Coyote organizations',
        'Band, colorguard, sports and clubs',
        'Booster clubs, churches and nonprofits',
        'Keep every dollar you raise',
        'Same application, no payment step',
      ],
      left: 'Always open',
    },
  ];

  return (
    <section className="section section--cream-deep" id="vendors" aria-labelledby="vendors-title">
      <div className="shell">
        <p className="eyebrow">Vendors, trucks and organizations</p>
        <h2 id="vendors-title">Come set up where the whole town shows up</h2>
        <p className="lede">
          One flat fee per event. We do not take a percentage of what you sell. What you make is
          yours.
        </p>

        <div className="pricing__grid">
          {cards.map((card) => (
            <article key={card.name} className={card.feature ? 'price price--feature' : 'price'}>
              {card.flag ? <span className="price__flag">{card.flag}</span> : null}
              <h3 className="price__name">{card.name}</h3>
              <p className="price__amount">{card.amount}</p>
              <p className="price__per">{card.per}</p>
              <ul>
                {card.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {card.left ? <p className="price__left">{card.left}</p> : null}
              <a className="btn btn--primary" href="#apply">
                Apply now
              </a>
            </article>
          ))}
        </div>

        <p className="pricing__note">
          Spots are first come, first paid. Your space is not held until the fee is in. Space
          assignment is up to us so the layout stays safe and people can move around. Every
          vendor carries their own permits and insurance.
        </p>
      </div>
    </section>
  );
}
