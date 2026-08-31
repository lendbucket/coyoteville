import { PRICING, nextEventByDate } from '@/lib/seo';
import { getSpots, type SpotLine } from '@/lib/spots';

/**
 * Vendor spot cards.
 *
 * The "spots left" line on each card is counted out of the database, not
 * written here. When capacity is not set on the event the line is omitted
 * rather than guessed at.
 */

/**
 * Card copy is the owner's own wording, split at sentence boundaries so it fits
 * the card. The words are exact. Do not reword it to balance the columns.
 */
const BOOTH_POINTS = [
  'A designated space to set up.',
  'Open to Coyote merch, boutiques, crafts, small businesses, and other vendors.',
  'Bring your own table, chairs, canopy, and decorations.',
  'One vehicle per space.',
];

const TRUCK_POINTS = [
  'A designated spot for your truck with room to serve a line.',
  'All food trucks must have a current Texas DSHS health permit and food handler certificates on site.',
  'One vehicle per space.',
];

const ORG_POINTS = [
  'Any Alice organization sets up at no charge and keeps everything it raises.',
  'Band, colorguard, athletics, clubs, churches, and youth groups.',
];

function spotsLeftLabel(line: SpotLine): string | null {
  if (line.remaining === null) return null;
  if (line.remaining === 0) return 'Full for this event';
  if (line.remaining === 1) return '1 spot left';
  return `${line.remaining} spots left`;
}

export default async function Pricing() {
  /* The event people can actually book, resolved against the clock. This read
     NEXT_EVENT, the first entry in the static calendar, which never advances:
     the cards were quoting the finished event's remainders. */
  const spots = await getSpots(nextEventByDate().slug);

  const cards = [
    {
      name: PRICING.booth.label,
      amount: PRICING.booth.price,
      per: 'per event',
      feature: false,
      flag: null as string | null,
      points: BOOTH_POINTS,
      left: spots.available ? spotsLeftLabel(spots.booth) : null,
    },
    {
      name: PRICING.truck.label,
      amount: PRICING.truck.price,
      per: 'per event',
      feature: true,
      flag: null as string | null,
      points: TRUCK_POINTS,
      left: spots.available ? spotsLeftLabel(spots.truck) : null,
    },
    {
      name: PRICING.free.label,
      amount: PRICING.free.price,
      per: 'always',
      feature: false,
      flag: null as string | null,
      points: ORG_POINTS,
      left: 'No limit on organization spots',
    },
  ];

  return (
    <section className="section section--cream-deep" id="vendors" aria-labelledby="vendors-title">
      <div className="shell">
        <p className="eyebrow">Vendors and trucks</p>
        <h2 id="vendors-title">Vendor spots</h2>
        <p className="lede">
          One flat fee per event. We do not take a percentage of what you sell.
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
          Spots are first come, first paid, and your space is not held until the fee is in. We
          assign spaces so the layout stays safe. Every vendor carries their own permits and
          insurance.
        </p>
      </div>
    </section>
  );
}
