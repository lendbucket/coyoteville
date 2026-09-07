import Photo from './Photo';
import StringLights from './StringLights';
import EventCountdown from './EventCountdown';
import { SITE_PHOTOS } from '@/lib/photos';
import { gatesOpenAt, EVENT_TIMEZONE } from '@/lib/seo';
import { getNextEvent } from '@/lib/events-source';
import { zoneAbbreviation } from '@/lib/time';

/**
 * Server half of the gates-open countdown. Resolves the target instant from the
 * event's wall clock time and hands the client component the server clock.
 */
export default async function EventCountdownSection() {
  /* The next event by date, resolved per render so the page moves on to the
     following one by itself once tonight is over. */
  const NEXT_EVENT_RESOLVED = await getNextEvent();

  /* Nothing to count down to. Only reachable when the events table could not be
     read, and the section is entirely about the next event, so it renders
     nothing rather than a blank shape. */
  if (!NEXT_EVENT_RESOLVED) return null;

  const targetMs = gatesOpenAt(NEXT_EVENT_RESOLVED);

  return (
    <section className="evt" aria-labelledby="countdown-title">
      <div className="evt__bg" aria-hidden="true">
        <Photo photo={SITE_PHOTOS.stats} sizes="100vw" cover />
      </div>

      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={7} id="evt-lights" />

      <div className="shell evt__in">
        <EventCountdown
          targetMs={targetMs}
          serverNowMs={Date.now()}
          eventName={NEXT_EVENT_RESOLVED.name}
          displayDate={NEXT_EVENT_RESOLVED.displayDate}
          displayTime={NEXT_EVENT_RESOLVED.displayTime}
          zoneLabel={zoneAbbreviation(targetMs, EVENT_TIMEZONE)}
        />
      </div>
    </section>
  );
}
