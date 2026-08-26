/**
 * What happens next.
 *
 * One source for the confirmation screen and the vendor confirmation email.
 * Both read from here so the instructions can never drift apart, which matters
 * because a vendor reads one on Friday morning and the other on their phone at
 * the gate.
 *
 * Deliberately free of any server-only import, so the email templates can still
 * be rendered and previewed without the send machinery, the same reason
 * lib/notify-types.ts is separate.
 *
 * Structured as shared items plus one block per spot type. Add a rule to the
 * shared list and it appears for everybody; add it to a block and only that
 * type sees it.
 */

export type SpotKind = 'booth' | 'truck' | 'free';

/** Shown to every vendor, whatever they booked. */
export const NEXT_STEPS_SHARED: readonly string[] = [
  'Setup opens at 8:00 AM Friday morning.',
  'Gates open to the public at 4:00 PM.',
  'Bring one vehicle per space so the lot does not get crowded.',
  'Bring your own table, chairs, canopy, and decorations.',
  'Pack out everything you bring in, including all trash.',
  'Nothing goes on the ground, no gray water and no grease.',
  'Admission is free and the whole town is invited, so expect a crowd.',
  'Lot parking opens at kickoff for ten dollars per vehicle.',
] as const;

export type NextStepsBlock = {
  /** Subheading the type specific items sit under. */
  heading: string;
  items: readonly string[];
};

export const NEXT_STEPS_BY_SPOT: Record<SpotKind, NextStepsBlock> = {
  booth: {
    heading: 'If you have a vendor booth',
    items: [
      'Your space is for Coyote merch, boutiques, crafts, small businesses, and similar retail.',
      'Bring your own canopy and weights, since South Texas wind will take an unweighted tent.',
      'No cooking or open flame in a booth space.',
    ],
  },
  truck: {
    heading: 'If you are bringing a food truck',
    items: [
      'Bring your Texas DSHS health permit and food handler certificates on site, not at home, since they may be checked.',
      'Bring a properly rated fire extinguisher for your cooking method, including Class K if you cook with oil.',
      'Bring your own generator, power, and water.',
      'Contain all gray water and grease and take it with you.',
      'Arrive with enough clearance around your service window for a line to form.',
    ],
  },
  free: {
    heading: 'If you are an Alice organization',
    items: [
      'Your space is free and you keep every dollar you raise.',
      'Bring your own table, chairs, and canopy.',
      'If you are selling any food or drink, the same permit rules apply as food trucks, including a health permit.',
    ],
  },
};

export const NEXT_STEPS_CONTACT =
  'Call or text 540 447 9432 with any questions before Friday.';

export const NEXT_STEPS_HEADING = 'What happens next';

export function isSpotKind(value: unknown): value is SpotKind {
  return value === 'booth' || value === 'truck' || value === 'free';
}

/**
 * The block for a spot type, or null when the type is not known.
 *
 * The confirmation screen after Square checkout only knows the type if it was
 * carried through the redirect, so a null here means the page shows the shared
 * rules and points at the email, rather than guessing or showing all three.
 */
export function nextStepsFor(spot: unknown): NextStepsBlock | null {
  return isSpotKind(spot) ? NEXT_STEPS_BY_SPOT[spot] : null;
}
