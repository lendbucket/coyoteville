import { getSpots } from '@/lib/spots';
import { NEXT_EVENT, signupClosesZone } from '@/lib/seo';

/**
 * Live spots meter.
 *
 * Every figure is counted out of vendor_applications against the capacity on
 * the events row. When capacity is not set, or the database cannot be reached,
 * this says so rather than showing a percentage of nothing.
 */
export default async function SpotsMeter() {
  const spots = await getSpots(NEXT_EVENT.slug);

  if (!spots.available) {
    return (
      <section className="spots" aria-labelledby="spots-title">
        <div className="shell">
          <div className="spots__head">
            <h2 id="spots-title" className="spots__title">
              Spots for {NEXT_EVENT.name}
            </h2>
          </div>
          <p className="spots__empty">
            Spot counts are not available right now. The application below still works, and we
            confirm your space by email either way.
          </p>
        </div>
      </section>
    );
  }

  const { total, booth, truck, freeClaimed } = spots;
  const percent = total.percent;
  const closesZone = signupClosesZone();

  return (
    <section className="spots" aria-labelledby="spots-title">
      <div className="shell">
        <div className="spots__head">
          <h2 id="spots-title" className="spots__title">
            {percent !== null && percent >= 75
              ? `Spots for ${NEXT_EVENT.name} are going fast`
              : `Spots for ${NEXT_EVENT.name}`}
          </h2>
          {percent !== null ? <p className="spots__pct">{percent}% full</p> : null}
        </div>

        {percent !== null ? (
          <div
            className="spots__bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${percent} percent of vendor spots claimed`}
          >
            <i style={{ width: `${percent}%` }} />
          </div>
        ) : null}

        <div className="spots__foot">
          {total.capacity !== null ? (
            <span>
              <b>{total.claimed}</b> of {total.capacity} spots claimed
            </span>
          ) : (
            <span>
              <b>{total.claimed}</b> spots claimed so far
            </span>
          )}

          {total.remaining !== null ? (
            <span>
              <b>
                {total.remaining} left
              </b>{' '}
              &middot; signup closes {NEXT_EVENT.signupClosesDisplay} {closesZone}
            </span>
          ) : (
            <span>Signup closes {NEXT_EVENT.signupClosesDisplay} {closesZone}</span>
          )}
        </div>

        <ul className="spots__split">
          <li>
            <span className="spots__splitlabel">Booths</span>
            <span className="spots__splitvalue">
              {booth.capacity === null
                ? `${booth.claimed} claimed`
                : `${booth.claimed} of ${booth.capacity} claimed`}
            </span>
          </li>
          <li>
            <span className="spots__splitlabel">Food trucks</span>
            <span className="spots__splitvalue">
              {truck.capacity === null
                ? `${truck.claimed} claimed`
                : `${truck.claimed} of ${truck.capacity} claimed`}
            </span>
          </li>
          <li>
            <span className="spots__splitlabel">Coyote organisations</span>
            <span className="spots__splitvalue">
              {freeClaimed} signed up &middot; always free
            </span>
          </li>
        </ul>

        {!spots.capacityKnown ? (
          <p className="spots__empty">
            Capacity for this event is not set yet, so this is a running count rather than a
            percentage. Set booth_capacity and truck_capacity on the event to turn the bar on.
          </p>
        ) : null}
      </div>
    </section>
  );
}
