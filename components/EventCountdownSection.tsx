import Photo from './Photo';
import StringLights from './StringLights';
import EventCountdown from './EventCountdown';
import { SITE_PHOTOS } from '@/lib/photos';
import { NEXT_EVENT, gatesOpenAt, EVENT_TIMEZONE } from '@/lib/seo';
import { zoneAbbreviation } from '@/lib/time';

/**
 * Server half of the gates-open countdown. Resolves the target instant from the
 * event's wall clock time and hands the client component the server clock.
 */
export default function EventCountdownSection() {
  const targetMs = gatesOpenAt();

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
          eventName={NEXT_EVENT.name}
          displayDate={NEXT_EVENT.displayDate}
          displayTime={NEXT_EVENT.displayTime}
          zoneLabel={zoneAbbreviation(targetMs, EVENT_TIMEZONE)}
        />
      </div>
    </section>
  );
}
