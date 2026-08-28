/**
 * Why a sign in was refused, in the words the card shows.
 *
 * One map, because the card is reached two ways. With JavaScript the form
 * posts by fetch and the API answers with one of these codes, which is turned
 * into a message inline. Without it the browser posts the form itself and the
 * API redirects back to /admin?e=<code>. Same codes, same sentences, so the
 * two paths cannot drift apart.
 */
export const LOGIN_ERRORS = {
  bad: 'That password did not match. Try again.',
  rate: 'Too many tries. Wait a few minutes and try again.',
  unset: 'ADMIN_PASSWORD is not set on the server yet.',
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

/** The sentence for a code, or null when the code is not one of ours. */
export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (LOGIN_ERRORS as Record<string, string>)[code] ?? null;
}
