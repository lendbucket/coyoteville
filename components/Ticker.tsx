import { NEXT_EVENT, PRICING } from '@/lib/seo';

/**
 * Scrolling ticker under the hero. Carries the real event date and the real
 * prices, straight off lib/seo so it can never drift from the schema.
 *
 * The item list is rendered three times and the run is translated by exactly
 * one third, so it lands on an identical frame and the loop has no seam. Three
 * copies rather than two so that two of them still overflow a very wide
 * viewport, which is what stops a gap appearing at the right edge.
 *
 * The moving strip is aria-hidden. The same facts are announced once,
 * statically, for assistive tech and for anything reading the markup.
 */
export default function Ticker() {
  const items = [
    `${NEXT_EVENT.name} · ${NEXT_EVENT.displayDate} · ${NEXT_EVENT.displayTime}`,
    'Free spots for Alice Coyote organizations',
    `Vendor booths ${PRICING.booth.price} · Truck spots ${PRICING.truck.price}`,
    'Flat rate. No commission on your sales.',
  ];

  const COPIES = 3;
  const run = Array.from({ length: COPIES }, () => items).flat();

  return (
    <aside className="ticker" aria-label="Next event and vendor pricing">
      <p className="ticker__sr">
        {NEXT_EVENT.name} on{' '}
        <time dateTime={NEXT_EVENT.startISO}>
          {NEXT_EVENT.displayDate} at {NEXT_EVENT.displayTime}
        </time>
        . Vendor booths {PRICING.booth.price}, food truck spots {PRICING.truck.price}, free for
        Alice Coyote organizations, booster clubs and nonprofits.
      </p>

      <div className="ticker__track" aria-hidden="true">
        <div className="ticker__run">
          {run.map((text, i) => (
            <span key={i} className="ticker__item">
              {text}
              <b className="ticker__sep">&#9670;</b>
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
