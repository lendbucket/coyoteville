/**
 * The shape of an event as the browser needs it.
 *
 * Plain data, no server-only import, because both the vendor form and the
 * waitlist form are client components and have to be able to import the type.
 * lib/event-schedule.ts builds these on the server and passes them down; the
 * live state travels with the event so the form can decide between applying
 * and waitlisting without a second round trip.
 */
export type EventOption = {
  slug: string;
  name: string;
  displayDate: string;
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
  if (!event.isOpen) return false;
  if (spot === 'truck') return event.truckOpen;
  if (spot === 'booth') return event.boothOpen;
  return true;
}

/**
 * Why an event is not taking applications, in words a vendor understands.
 *
 * Takes the spot type because the answer is often about that type rather than
 * the event: telling somebody the whole event is full when the trucks are
 * still going would be wrong, and telling them nothing at all is worse.
 */
export function closedReason(event: EventOption, spot?: string): string {
  if (event.deadlinePassed) {
    return `Signup for ${event.name} closed ${event.signupClosesDisplay} Central.`;
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
