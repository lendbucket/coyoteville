import { getSpots } from '@/lib/spots';
import { getSelectableEvents, type ScheduledEvent } from '@/lib/event-schedule';
import type { SpotsSnapshot } from '@/lib/spots';

/**
 * Every upcoming event, one card each, in date order.
 *
 * The whole point is that each card answers for its own event. A single global
 * meter could only ever describe one of them, and when the site started
 * carrying two dates that meant the sold out one vanished from the page while
 * the open one showed its numbers under the wrong heading.
 *
 * So the state on a card comes from that event's row and that event's count:
 * its own capacity, its own claimed total, its own deadline out of
 * signup_closes_at, and a call to action that follows from those. A full or
 * closed event stays on the page reading full, because people still need to
 * see that the date exists and that they can get on the list for it.
 */

function meterLine(spots: SpotsSnapshot, event: ScheduledEvent): string {
  if (!spots.available) return 'Spot counts are not loading right now.';
  if (!spots.capacityKnown) return `${spots.total.claimed} spots claimed so far`;
  return `${spots.total.claimed} of ${spots.total.capacity} spots claimed`;
}

export function EventCard({ event, spots }: { event: ScheduledEvent; spots: SpotsSnapshot }) {

  const { lifecycle } = event;
  const isFull = lifecycle.state === 'FULL';
  const closed = !lifecycle.canApply;
  const percent = isFull ? 100 : spots.total.percent;
  const remaining = spots.total.remaining;

  return (
    <li className={`evcard ${closed ? 'evcard--closed' : ''}`}>
      <div className="evcard__head">
        <div>
          <h3 className="evcard__name">{event.name}</h3>
          <p className="evcard__when">
            <time dateTime={event.startISO}>{event.displayDate}</time> at {event.displayTime}
          </p>
        </div>
        <span className={`evcard__state ${closed ? 'is-closed' : 'is-open'}`}>
          {lifecycle.state === 'LIVE'
            ? 'Happening now'
            : isFull
              ? 'Full'
              : closed
                ? 'Closed'
                : 'Open'}
        </span>
      </div>

      {percent !== null ? (
        <div
          className="evcard__bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${percent} percent of vendor spots claimed for ${event.name}`}
        >
          <i className={isFull ? 'is-full' : ''} style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      <p className="evcard__count">
        {isFull ? (
          <b>Every spot is taken</b>
        ) : remaining !== null ? (
          <>
            <b>{remaining} spots available</b> &middot; {meterLine(spots, event)}
          </>
        ) : (
          meterLine(spots, event)
        )}
      </p>

      {spots.capacityKnown ? (
        <ul className="evcard__split">
          <li>
            <span>Booths</span>
            <b>
              {spots.booth.capacity === null
                ? `${spots.booth.claimed} claimed`
                : `${spots.booth.claimed} of ${spots.booth.capacity}`}
            </b>
          </li>
          <li>
            <span>Trucks</span>
            <b>
              {spots.truck.capacity === null
                ? `${spots.truck.claimed} claimed`
                : `${spots.truck.claimed} of ${spots.truck.capacity}`}
            </b>
          </li>
          <li>
            <span>Alice orgs</span>
            <b>{spots.freeClaimed} signed up</b>
          </li>
        </ul>
      ) : null}

      <p className="evcard__note">
        {lifecycle.state === 'LIVE' ? (
          <>This one is running right now. Come down.</>
        ) : isFull ? (
          <>Every spot has been claimed. Join the waitlist and we will call if one frees up.</>
        ) : closed ? (
          <>
            Signups are closed for this date. The cutoff was {event.signupClosesDisplay}{' '}
            {event.signupClosesZoneLabel}.
          </>
        ) : (
          <>
            Signup closes {event.signupClosesDisplay} {event.signupClosesZoneLabel}.
          </>
        )}
      </p>

      {/* A call to action only where there is one to make. The waitlist used to
          appear on any date that was not open, which meant a date whose deadline
          had simply passed offered a list nobody would ever be taken off. It is
          now offered for FULL and nothing else, and a closed or running date
          gets no button at all.

          The link carries the event, so landing on the form preselects this date
          rather than whichever one happens to be the default. */}
      {lifecycle.canApply || lifecycle.showWaitlist ? (
        <a
          className={`btn ${lifecycle.showWaitlist ? 'btn--ghost' : 'btn--amber'} evcard__cta`}
          href={`/?event=${encodeURIComponent(event.slug)}#apply`}
        >
          {lifecycle.showWaitlist ? 'Join the waitlist' : 'Reserve a spot'}
        </a>
      ) : null}
    </li>
  );
}

export default async function EventsSection() {
  const events = await getSelectableEvents();
  if (!events.length) return null;

  // Counts are fetched here rather than inside each card, so the cards stay
  // plain synchronous components and every event is read in one pass.
  const cards = await Promise.all(
    events.map(async (event) => ({ event, spots: await getSpots(event.slug) }))
  );

  return (
    <section className="section events" id="events" aria-labelledby="events-title">
      <div className="shell">
        <p className="eyebrow">Dates</p>
        <h2 id="events-title">Upcoming events</h2>
        <p className="lede muted events__lede">
          Every date we are open, with what is left on each. A full date takes waitlist
          signups; once signup closes we are set for that night.
        </p>

        <ul className="events__list">
          {cards.map(({ event, spots }) => (
            <EventCard key={event.slug} event={event} spots={spots} />
          ))}
        </ul>
      </div>
    </section>
  );
}
