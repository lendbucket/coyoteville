import 'server-only';
import { Resend } from 'resend';
import { SITE } from './seo';
import { supportEmail } from './support';
import type { RegistrationEmail } from './notify-types';
import { renderVendorConfirmation } from './email/vendor-confirmation';
import { renderAdminNotification, type NotificationStage } from './email/admin-notification';

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

/** Internal alerts only. Never the address shown to the public. */
const OWNER_EMAIL = SITE.ownerEmail;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.FROM_EMAIL);
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY as string);
  return client;
}

/**
 * Owner only, fired the moment a form is submitted. The vendor deliberately
 * gets nothing here: telling someone their spot is confirmed before they have
 * paid would be wrong. Their confirmation waits for the webhook.
 */
export async function notifyRegistrationStarted(r: RegistrationEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping started notification', { application: r.id });
    return;
  }

  const owner = renderAdminNotification(r, 'started');

  try {
    const result = await resend().emails.send({
      from: process.env.FROM_EMAIL as string,
      to: OWNER_EMAIL,
      replyTo: r.email,
      subject: owner.subject,
      html: owner.html,
      text: owner.text,
    });
    if (result?.error) {
      console.error('started notification rejected by Resend', { application: r.id, error: result.error });
    }
  } catch (err) {
    console.error('started notification failed to send', { application: r.id, error: err });
  }
}

/** Send both messages. Never throws. Call only after the write has succeeded. */
export async function notifyRegistration(r: RegistrationEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping registration notification', { application: r.id });
    return;
  }

  const from = process.env.FROM_EMAIL as string;
  const owner = renderAdminNotification(r);
  const vendor = renderVendorConfirmation(r, supportEmail());

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
      // Vendors reply to the monitored address, not to the owner's alerts
      // inbox, whatever the from address happens to be.
      replyTo: supportEmail(),
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

/**
 * Send one reminder. Returns whether it actually went out, so the caller only
 * logs a reminder that was really delivered to Resend.
 */
export async function sendReminderEmail(
  to: string,
  message: { subject: string; html: string; text: string }
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, cannot send reminder', { to });
    return false;
  }

  try {
    const result = await resend().emails.send({
      from: process.env.FROM_EMAIL as string,
      to,
      replyTo: supportEmail(),
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result?.error) {
      console.error('reminder rejected by Resend', { to, error: result.error });
      return false;
    }

    return true;
  } catch (err) {
    console.error('reminder failed to send', { to, error: err });
    return false;
  }
}
