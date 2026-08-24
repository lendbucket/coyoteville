import 'server-only';

/**
 * Public contact address.
 *
 * Kept out of lib/seo.ts on purpose. seo.ts is imported by client components,
 * and a plain SUPPORT_EMAIL is not inlined into the client bundle, so reading
 * it there would give the server one value and the browser another and produce
 * a hydration mismatch. Server code calls this; client components take the
 * address as a prop.
 *
 * This is the address vendors and the public see. Internal alerts about new
 * registrations go somewhere else entirely, see SITE.ownerEmail.
 */
export const DEFAULT_SUPPORT_EMAIL = 'support@coyoteville.com';

export function supportEmail(): string {
  return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}
