import DeadlineBar from './DeadlineBar';
import { getNextEventByDate } from '@/lib/event-schedule';

/**
 * Server half of the countdown bar.
 *
 * Counts down to gates opening at the next event by date, not to a vendor
 * signup deadline. The bar is the first thing on the public page and the public
 * is coming to the event, not to the application form: once signup shut two
 * days out, a deadline countdown had nothing left to say and sat at zero while
 * the event it belonged to was still tomorrow.
 *
 * "Next by date" means the soonest event that has not finished, so the bar
 * holds on tomorrow's date all through tomorrow night and moves itself to the
 * following one after that, with no deploy.
 *
 * The signup cutoff still appears, as a line under the clock, and it comes from
 * signup_closes_at through lib/event-schedule rather than from anything
 * compiled into the build.
 */
export default async function DeadlineBarMount() {
  const event = await getNextEventByDate();

  return (
    <DeadlineBar
      targetMs={event.gatesOpenAtMs}
      serverNowMs={Date.now()}
      eventName={event.name}
      eventDate={event.displayDate}
      eventTime={event.displayTime}
      signupOpen={event.isOpen}
      signupClosesDisplay={event.signupClosesDisplay}
      zoneLabel={event.signupClosesZoneLabel}
      initiallyOpen={Date.now() >= event.gatesOpenAtMs}
    />
  );
}
