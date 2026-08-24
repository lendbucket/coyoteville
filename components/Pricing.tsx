import { PRICING } from '@/lib/seo';

const CARDS = [
  {
    name: PRICING.booth.label,
    amount: PRICING.booth.price,
    per: 'per event',
    feature: false,
    flag: null as string | null,
    points: [
      'A 10 by 10 space for your tent',
      'Craft, retail, produce or packaged goods',
      'Bring your own tent, tables and chairs',
      'Flat rate, we take no commission',
    ],
  },
  {
    name: PRICING.truck.label,
    amount: PRICING.truck.price,
    per: 'per event',
    feature: true,
    flag: 'Most trucks',
    points: [
      'Room to pull in and set up your window',
      'Bring your own generator, power and water',
      'Your permits and your insurance, your call',
      'Flat rate, we take no commission',
    ],
  },
  {
    name: PRICING.free.label,
    amount: PRICING.free.price,
    per: 'always',
    feature: false,
    flag: null as string | null,
    points: [
      'Alice Coyote organizations',
      'Booster clubs and school groups',
      'Registered nonprofits',
      'Same application, no payment step',
    ],
  },
];

export default function Pricing() {
  return (
    <section className="section section--cream-deep" id="vendors" aria-labelledby="vendors-title">
      <div className="shell">
        <p className="eyebrow">Vendor spots</p>
        <h2 id="vendors-title">Set up at Coyoteville</h2>
        <p className="lede">
          One flat fee per event. We do not take a percentage of what you sell. What you make is
          yours.
        </p>

        <div className="pricing__grid">
          {CARDS.map((card) => (
            <article
              key={card.name}
              className={card.feature ? 'price price--feature' : 'price'}
            >
              {card.flag ? <span className="price__flag">{card.flag}</span> : null}
              <h3 className="price__name">{card.name}</h3>
              <p className="price__amount">{card.amount}</p>
              <p className="price__per">{card.per}</p>
              <ul>
                {card.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
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
