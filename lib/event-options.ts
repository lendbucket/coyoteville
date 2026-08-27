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
};

/** Why an event is not taking applications, in words a vendor understands. */
export function closedReason(event: EventOption): string {
  if (event.isFull === true) {
    return `${event.name} is full.`;
  }
  if (event.deadlinePassed) {
    return `Signup for ${event.name} closed ${event.signupClosesDisplay} Central.`;
  }
  return `${event.name} is not taking applications.`;
}
