/**
 * The shape of an event as the browser needs it.
 *
 * Plain data, no server-only import, because both the vendor form and the
 * waitlist form are client components and have to be able to import the type.
 * lib/event-schedule.ts builds these on the server and passes them down; the
 * live state travels with the event so the form can decide between applying
 * and waitlisting without a second round trip.
 */
import {
  canApplyForSpot,
  offeredForSpot,
  waitlistForSpot,
  type EventLifecycle,
} from './event-state';

export type EventOption = {
  slug: string;
  name: string;
  displayDate: string;
  /** The Central date it falls on, YYYY-MM-DD. What the permit rule compares. */
  date: string;
  /** The event's state right now. What every gate below actually reads. */
  lifecycle: EventLifecycle;
  /** Published, deadline not passed, not full. */
  isOpen: boolean;
  deadlinePassed: boolean;
  /** Null when no capacity is set, meaning "cannot tell", not "full". */
  isFull: boolean | null;
  /** "Wednesday, August 26, 2026 at 11:59 PM". */
  signupClosesDisplay: string;
  remaining: number | null;
  /** Still taking booth applications. Intake is capped per type. */
  boothOpen: boolean;
  /** Still taking food truck applications. */
  truckOpen: boolean;
};

/**
 * Whether this event is taking applications for one spot type.
 *
 * Free organisation spots consume no booth or truck capacity, so they follow
 * the event as a whole. The other two have their own queue and run out on
 * their own.
 */
export function isOpenForSpot(event: EventOption, spot: string): boolean {
  return canApplyForSpot(event.lifecycle, spot);
}

/**
 * Does this event sell this spot type at all?
 *
 * The difference between "gone" and "not on the menu", which the site was
 * telling vendors was the same thing. A booth vendor reading "sold out" on a
 * home game thinks they were slow; the truth is that home games are trucks
 * only and their night is a different night. One of those makes them come
 * back and the other loses them.
 */
export function isOfferedForSpot(event: EventOption, spot: string): boolean {
  return offeredForSpot(event.lifecycle, spot);
}

/** Every type this event actually sells, in the order the form lists them. */
export function offeredSpotTypes(event: EventOption): ('booth' | 'truck' | 'free')[] {
  return (['booth', 'truck', 'free'] as const).filter((s) => isOfferedForSpot(event, s));
}

/**
 * The line shown where the missing types used to be.
 *
 * Says what this night is rather than what it is not, and points at the thing
 * that replaces it, because a vendor who has just lost their option needs
 * somewhere to go next.
 */
export function notOfferedNote(event: EventOption): string | null {
  const booth = isOfferedForSpot(event, 'booth');
  const truck = isOfferedForSpot(event, 'truck');

  if (booth && truck) return null;

  if (truck && !booth) {
    return (
      `${event.name} is food trucks only. Vendor booths and organization tables are not ` +
      'offered on home game nights. We will announce other event nights for booths.'
    );
  }

  if (booth && !truck) {
    return (
      `${event.name} is vendor booths only. Food truck spots are not offered on this night. ` +
      'We will announce other event nights for trucks.'
    );
  }

  return `${event.name} is not selling vendor spots.`;
}

/**
 * Whether this vendor should be offered the waitlist rather than the form.
 *
 * Only inside the signup window, and only for a type that has actually run
 * out. A closed or finished date offers neither: nobody is being taken off a
 * list for a date that is not selling, so a waitlist there would be a form that
 * collects an address and does nothing with it.
 */
export function isWaitlistForSpot(event: EventOption, spot: string): boolean {
  return waitlistForSpot(event.lifecycle, spot);
}

/**
 * Why an event is not taking applications, in words a vendor understands.
 *
 * Takes the spot type because the answer is often about that type rather than
 * the event: telling somebody the whole event is full when the trucks are
 * still going would be wrong, and telling them nothing at all is worse.
 */
export function closedReason(event: EventOption, spot?: string): string {
  if (event.lifecycle.state === 'LIVE') {
    return `${event.name} is happening now.`;
  }
  if (event.deadlinePassed) {
    return `Signup for ${event.name} closed ${event.signupClosesDisplay} Central.`;
  }
  /* Not offered is answered before full, because it is a different fact and
     the wrong one of the two is the reason this exists. */
  if (spot && !isOfferedForSpot(event, spot)) {
    return notOfferedNote(event) ?? `${event.name} does not offer that spot type.`;
  }
  if (event.isFull === true) {
    return `${event.name} is full.`;
  }
  if (spot === 'booth' && !event.boothOpen) {
    return `The booths for ${event.name} are full.`;
  }
  if (spot === 'truck' && !event.truckOpen) {
    return `The food truck spots for ${event.name} are full.`;
  }
  return `${event.name} is not taking applications.`;
}
