/**
 * Volunteer rules that both the phone and the server need.
 *
 * No 'server-only' and no database client: the signing form is a client
 * component and has to decide, as somebody types their date of birth, whether
 * to show the guardian fields. The server then decides again from the same
 * function, because the form's answer is a convenience and the row's answer is
 * a fact.
 */

/** Adults an organization has to bring. Mirrors VOLUNTEER_MINIMUM. */
export const ADULT_AGE = 18;

/**
 * Is this person an adult on the night they are working?
 *
 * Against the event date, not against today. A volunteer who turns 18 the week
 * after the game is a minor at the game, and a form filled in on the night
 * would get that right by accident while one filled in a month early would get
 * it wrong. Asking the question about the right date costs nothing.
 *
 * Both dates are plain YYYY-MM-DD in Central, which is how the events table
 * stores its date and how a date input reports one, so this is calendar
 * arithmetic and never touches a timezone. Doing it with Date objects is how
 * somebody born on the first of a month ends up a day younger in UTC.
 *
 * Null when either date is missing or malformed. Null is not false: the caller
 * has to decide what to do about a date it cannot read, and defaulting to adult
 * would let a minor through by typing badly.
 */
export function isAdultOn(dateOfBirth: string, eventDate: string): boolean | null {
  const dob = parseDay(dateOfBirth);
  const on = parseDay(eventDate);
  if (!dob || !on) return null;

  let age = on.y - dob.y;
  if (on.m < dob.m || (on.m === dob.m && on.d < dob.d)) age -= 1;

  return age >= ADULT_AGE;
}

/** Age on a given day, or null. Used for the tracker, which shows it. */
export function ageOn(dateOfBirth: string, eventDate: string): number | null {
  const dob = parseDay(dateOfBirth);
  const on = parseDay(eventDate);
  if (!dob || !on) return null;

  let age = on.y - dob.y;
  if (on.m < dob.m || (on.m === dob.m && on.d < dob.d)) age -= 1;
  return age;
}

function parseDay(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  /* Reject the thirty first of February rather than rolling it forward, which
     is what a Date would do silently. */
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }

  return { y, m: mo, d };
}

/**
 * Nobody was born in 1823 and nobody working a parking lot was born tomorrow.
 *
 * A range rather than an exact rule, because the point is to catch a typo in a
 * date field on a phone in the dark, not to police anybody's age.
 */
export function plausibleBirthDate(dateOfBirth: string, todayISO: string): boolean {
  const age = ageOn(dateOfBirth, todayISO);
  return age !== null && age >= 5 && age <= 110;
}
