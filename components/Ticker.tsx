import { nextEventByDate, PRICING } from '@/lib/seo';

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
  /* The next event by date, resolved per render so the page moves on to the
     following one by itself once tonight is over. */
  const NEXT_EVENT_RESOLVED = nextEventByDate();

  const items = [
    `${NEXT_EVENT_RESOLVED.name} · ${NEXT_EVENT_RESOLVED.displayDate} · ${NEXT_EVENT_RESOLVED.displayTime}`,
    'Alice organizations set up free',
    `Vendor booths ${PRICING.booth.price} · Truck spots ${PRICING.truck.price}`,
    'Admission is free · Parking $10 per vehicle at kickoff',
  ];

  const COPIES = 3;
  const run = Array.from({ length: COPIES }, () => items).flat();

  return (
    <aside className="ticker" aria-label="Next event and vendor pricing">
      <p className="ticker__sr">
        {NEXT_EVENT_RESOLVED.name} on{' '}
        <time dateTime={NEXT_EVENT_RESOLVED.startISO}>
          {NEXT_EVENT_RESOLVED.displayDate} at {NEXT_EVENT_RESOLVED.displayTime}
        </time>
        . Vendor booths {PRICING.booth.price}, food truck spots {PRICING.truck.price}. Alice
        organizations set up free. Admission is free and parking on the lot opens at kickoff for
        $10 per vehicle.
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
