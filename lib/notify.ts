import 'server-only';
import { Resend } from 'resend';
import { SITE } from './seo';
import type { RegistrationEmail } from './notify-types';
import { renderVendorConfirmation } from './email/vendor-confirmation';
import { renderAdminNotification } from './email/admin-notification';

export type { RegistrationEmail };

/**
 * Sending registration email.
 *
 * This file is the send logic only. The two messages live in lib/email so the
 * wording and the layout can be edited without touching anything here.
 *
 * Timing differs by path, on purpose:
 *   Paid applications send from the Square webhook once payment settles, so an
 *     abandoned checkout never produces a notification.
 *   Free Alice organization spots and prepaid link registrations send at
 *     submission, because there is no payment to wait on.
 *
 * Nothing here may fail a registration. The vendor's record is already written
 * by the time this runs, so every error is caught and logged. A missing email
 * is a nuisance; a lost booking is not.
 */

const OWNER_EMAIL = SITE.email;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.FROM_EMAIL);
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY as string);
  return client;
}

/** Send both messages. Never throws. Call only after the write has succeeded. */
export async function notifyRegistration(r: RegistrationEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping registration notification', { application: r.id });
    return;
  }

  const from = process.env.FROM_EMAIL as string;
  const owner = renderAdminNotification(r);
  const vendor = renderVendorConfirmation(r);

  // Sent independently so one failing does not stop the other.
  const results = await Promise.allSettled([
    resend().emails.send({
      from,
      to: OWNER_EMAIL,
      replyTo: r.email,
      subject: owner.subject,
      html: owner.html,
      text: owner.text,
    }),
    resend().emails.send({
      from,
      to: r.email,
      replyTo: OWNER_EMAIL,
      subject: vendor.subject,
      html: vendor.html,
      text: vendor.text,
    }),
  ]);

  results.forEach((result, i) => {
    const which = i === 0 ? 'owner notification' : 'vendor confirmation';

    if (result.status === 'rejected') {
      console.error(`${which} failed to send`, { application: r.id, error: result.reason });
      return;
    }

    // Resend reports delivery problems in the body rather than by throwing.
    // An unverified sending domain shows up here and nowhere else.
    if (result.value?.error) {
      console.error(`${which} rejected by Resend`, { application: r.id, error: result.value.error });
    }
  });
}
