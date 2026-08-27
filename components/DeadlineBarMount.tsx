import DeadlineBar from './DeadlineBar';
import { getNextOpenEvent } from '@/lib/event-schedule';

/**
 * Server half of the deadline bar.
 *
 * Counts down to the next event that is still taking applications, not to
 * whichever is first in the calendar: once August closes, the bar has to move
 * to September on its own rather than sitting at zero.
 *
 * The deadline comes from events.signup_closes_at when it is set, so moving a
 * cutoff is a database edit rather than a deploy. lib/event-schedule falls back
 * to the compiled calendar when Supabase is unreachable.
 *
 * Renders nothing when every event has closed. A countdown to a date that has
 * already gone is worse than no countdown.
 */
export default async function DeadlineBarMount() {
  const event = await getNextOpenEvent();
  if (!event) return null;

  return (
    <DeadlineBar
      targetMs={event.signupClosesAtMs}
      serverNowMs={Date.now()}
      closesDisplay={event.signupClosesDisplay}
      zoneLabel={event.signupClosesZoneLabel}
      initiallyClosed={false}
    />
  );
}
