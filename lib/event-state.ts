/**
 * What state an event is in, right now.
 *
 * Nothing on the public site used to derive this from the clock. Whether an
 * event showed came from is_published, a column somebody has to remember to
 * flip, and the day after an event it was still on the homepage with a working
 * waitlist link. This is the one place that answers the question, and every
 * part of the site that renders an event reads it.
 *
 * The five states, in the order they are tested:
 *
 *   PAST    the night is over. Gone from the public site entirely: no card, no
 *           countdown, no apply, no waitlist, and out of the structured data.
 *           Still in the database and still in the tracker, which needs those
 *           rows long after the public has stopped caring.
 *   LIVE    it is happening. Shown as happening, nothing to apply for.
 *   CLOSED  still to come, but signup shut. The date and the countdown stay up
 *           because people are coming to it. No apply and NO waitlist: a
 *           waitlist for a date nobody is being taken off is a form that
 *           collects addresses and does nothing with them.
 *   OPEN    signup window open and room left. Apply.
 *   FULL    signup window open and no room left. Waitlist instead of apply.
 *
 * No 'server-only' import: the type crosses to the client with the event
 * options so the forms can gate on it without a second round trip.
 */

export const EVENT_STATES = ['PAST', 'LIVE', 'CLOSED', 'OPEN', 'FULL'] as const;
export type EventState = (typeof EVENT_STATES)[number];

/** One spot type's room on one event. */
export type SpotAvailability = {
  /** Null when the event row carries no capacity: "cannot tell", not "full". */
  capacity: number | null;
  taken: number;
  /** Null when capacity is unknown. */
  remaining: number | null;
  /** Capacity is known and none of it is left. */
  full: boolean;
};

export type EventLifecycle = {
  state: EventState;
  /** False only for PAST and unpublished. The public site renders nothing. */
  publiclyVisible: boolean;
  /** LIVE, CLOSED, OPEN and FULL all still count down to or through the night. */
  showCountdown: boolean;
  /** OPEN or FULL: the signup window has not shut. */
  signupWindowOpen: boolean;
  /** OPEN. At least one spot type still has room. */
  canApply: boolean;
  /** FULL, and only FULL. */
  showWaitlist: boolean;
  booth: SpotAvailability;
  truck: SpotAvailability;
};

export type LifecycleInput = {
  isPublished: boolean;
  startsAtMs: number;
  endsAtMs: number;
  signupClosesAtMs: number;
  booth: SpotAvailability;
  truck: SpotAvailability;
};

/** Room for one type: capacity minus what is taken, floored, never negative. */
export function availability(capacity: number | null, taken: number): SpotAvailability {
  if (capacity === null) {
    // Unknown capacity is not full. Refusing applications because nobody has
    // set a number would turn a missing config value into lost business.
    return { capacity: null, taken, remaining: null, full: false };
  }
  const remaining = Math.max(0, capacity - taken);
  return { capacity, taken, remaining, full: remaining <= 0 };
}

/**
 * The state of one event at one instant.
 *
 * Capacity is asked per spot type and the event is only FULL when both are
 * gone. An event with the booths full and the trucks still going is OPEN, and
 * it is the per type flags that send a booth vendor to the waitlist while a
 * truck vendor still gets the form. Gating the whole event on one number would
 * turn away every truck on the strength of the booths being popular.
 */
export function eventLifecycle(input: LifecycleInput, now: number = Date.now()): EventLifecycle {
  const { isPublished, startsAtMs, endsAtMs, signupClosesAtMs, booth, truck } = input;

  const base = { booth, truck };

  if (!isPublished || now > endsAtMs) {
    return {
      ...base,
      state: 'PAST',
      publiclyVisible: false,
      showCountdown: false,
      signupWindowOpen: false,
      canApply: false,
      showWaitlist: false,
    };
  }

  if (now >= startsAtMs) {
    return {
      ...base,
      state: 'LIVE',
      publiclyVisible: true,
      showCountdown: true,
      signupWindowOpen: false,
      canApply: false,
      showWaitlist: false,
    };
  }

  if (now > signupClosesAtMs) {
    return {
      ...base,
      state: 'CLOSED',
      publiclyVisible: true,
      showCountdown: true,
      signupWindowOpen: false,
      canApply: false,
      showWaitlist: false,
    };
  }

  // Full only when every paid type is gone. One type with room keeps the event
  // open, and the per type flags decide who sees which form.
  const anyRoom = !booth.full || !truck.full;

  return {
    ...base,
    state: anyRoom ? 'OPEN' : 'FULL',
    publiclyVisible: true,
    showCountdown: true,
    signupWindowOpen: true,
    canApply: anyRoom,
    showWaitlist: !anyRoom,
  };
}

/**
 * Whether this event is taking applications for one spot type.
 *
 * Free organisation spots have no capacity column of their own and follow the
 * event, which is the rule intake has always used. Note that the capacity meter
 * counts a free spot against the booths, since an org stands in a booth
 * footprint; the two differ on purpose and the meter is the one that decides
 * whether the lot is oversold.
 */
export function canApplyForSpot(lifecycle: EventLifecycle, spot: string): boolean {
  if (!lifecycle.signupWindowOpen) return false;
  if (spot === 'booth') return !lifecycle.booth.full;
  if (spot === 'truck') return !lifecycle.truck.full;
  return lifecycle.canApply;
}

/** Whether a vendor picking this type should be sent to the waitlist. */
export function waitlistForSpot(lifecycle: EventLifecycle, spot: string): boolean {
  // Only ever inside the signup window. A closed or finished date takes nobody
  // off a waitlist, so offering one would be collecting addresses for nothing.
  if (!lifecycle.signupWindowOpen) return false;
  if (spot === '') return lifecycle.showWaitlist;
  return !canApplyForSpot(lifecycle, spot);
}
