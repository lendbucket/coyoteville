import DeadlineBar from './DeadlineBar';
import { NEXT_EVENT, isSignupClosed, signupClosesAt, signupClosesZone } from '@/lib/seo';

/**
 * Server half of the deadline bar. Resolves the cutoff instant from the wall
 * clock time in lib/seo, and hands the client its own clock to measure from.
 * Change the deadline in EVENTS; nothing here needs touching.
 */
export default function DeadlineBarMount() {
  return (
    <DeadlineBar
      targetMs={signupClosesAt()}
      serverNowMs={Date.now()}
      closesDisplay={NEXT_EVENT.signupClosesDisplay}
      zoneLabel={signupClosesZone()}
      initiallyClosed={isSignupClosed()}
    />
  );
}
