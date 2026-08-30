import 'server-only';
import { Resend } from 'resend';
import { SITE } from './seo';
import { supportEmail } from './support';
import type { RegistrationEmail } from './notify-types';
import { renderVendorConfirmation } from './email/vendor-confirmation';
import { renderPaymentReceived, renderVendorDenied, type DeniedEmail } from './email/vendor-review';
import { renderAdminNotification, type NotificationStage } from './email/admin-notification';
import {
  renderWaitlistJoined,
  renderWaitlistOffer,
  renderWaitlistOwnerAlert,
  type WaitlistEmailVendor,
} from './email/waitlist';

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

/**
 * Send both messages. Never throws. Call only after the write has succeeded.
 *
 * This is the settled-and-done path, which since the approval workflow landed
 * means prepaid registrations only: those were agreed by phone before the link
 * was ever sent, so the vendor really is confirmed and gets the confirmation.
 * Everything that goes through review uses notifyPaymentReceived instead.
 */
export async function notifyRegistration(r: RegistrationEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping registration notification', { application: r.id });
    return;
  }

  const from = process.env.FROM_EMAIL as string;
  const owner = renderAdminNotification(r, 'confirmed');
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

/* ---------------------------------------------------------- review flow */

/**
 * One vendor message and one owner message, sent independently.
 *
 * Every send in the review flow has this shape, so the fan out, the reply-to
 * rules and the logging live here once rather than three times. Vendors always
 * reply to the monitored support address, never to the owner's alerts inbox,
 * whatever the from address happens to be.
 */
async function sendPair(
  applicationId: string,
  vendorTo: string,
  vendorMessage: { subject: string; html: string; text: string } | null,
  ownerMessage: { subject: string; html: string; text: string } | null,
  replyToOwner: string
): Promise<void> {
  const from = process.env.FROM_EMAIL as string;
  const sends: Promise<unknown>[] = [];
  const labels: string[] = [];

  if (ownerMessage) {
    labels.push('owner notification');
    sends.push(
      resend().emails.send({
        from,
        to: OWNER_EMAIL,
        replyTo: replyToOwner,
        subject: ownerMessage.subject,
        html: ownerMessage.html,
        text: ownerMessage.text,
      })
    );
  }

  if (vendorMessage) {
    labels.push('vendor email');
    sends.push(
      resend().emails.send({
        from,
        to: vendorTo,
        replyTo: supportEmail(),
        subject: vendorMessage.subject,
        html: vendorMessage.html,
        text: vendorMessage.text,
      })
    );
  }

  const results = await Promise.allSettled(sends);

  results.forEach((result, i) => {
    const which = labels[i];
    if (result.status === 'rejected') {
      console.error(`${which} failed to send`, { application: applicationId, error: result.reason });
      return;
    }
    // Resend reports delivery problems in the body rather than by throwing.
    const value = result.value as { error?: unknown } | undefined;
    if (value?.error) {
      console.error(`${which} rejected by Resend`, { application: applicationId, error: value.error });
    }
  });
}

/**
 * Payment settled, so the application has joined the review queue.
 *
 * The vendor is told plainly that this is not a confirmed spot, and the owner
 * is told there is something waiting on them. This replaces what used to be a
 * confirmation at this point, because the money landing no longer means the
 * vendor has a spot.
 */
export async function notifyPaymentReceived(r: RegistrationEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping review notification', { application: r.id });
    return;
  }

  await sendPair(
    r.id,
    r.email,
    renderPaymentReceived(r, supportEmail()),
    renderAdminNotification(r, 'review'),
    r.email
  );
}

/**
 * Approved. This is the message that used to go out at payment, and it is now
 * the only one that says the spot is real.
 *
 * Vendor only: the owner is the person who just pressed the button, so mailing
 * them about their own decision would be noise.
 */
export async function notifyApproved(r: RegistrationEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping approval email', { application: r.id });
    return;
  }

  await sendPair(r.id, r.email, renderVendorConfirmation(r, supportEmail()), null, r.email);
}

/** Denied, with the reason the admin typed and the refund that went with it. */
export async function notifyDenied(r: DeniedEmail): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping denial email', { application: r.id });
    return;
  }

  await sendPair(r.id, r.email, renderVendorDenied(r, supportEmail()), null, r.email);
}

/**
 * Send one reminder. Returns whether it actually went out, so the caller only
 * logs a reminder that was really delivered to Resend.
 */
export async function sendReminderEmail(
  to: string,
  message: { subject: string; html: string; text: string },
  /**
   * Optional files. The reminder path never passes any; the composer does.
   * Kept on this one sender rather than adding a second near identical
   * function, because the only difference is the attachments array.
   */
  attachments: { filename: string; content: Buffer; contentType: string }[] = []
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
      ...(attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
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

/**
 * Vendor photos, out to whatever address was typed into the tracker.
 *
 * Attachments rather than links, because the person receiving these needs to
 * save the files and a signed URL will have expired by then. Reply-to is the
 * public support address so a question comes somewhere useful.
 */
export async function sendMediaEmail(
  to: string,
  message: { subject: string; html: string; text: string },
  attachments: { filename: string; content: Buffer; contentType: string }[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, cannot send photos', { to });
    return { ok: false, error: 'Email is not connected. Set RESEND_API_KEY and FROM_EMAIL.' };
  }

  try {
    const result = await resend().emails.send({
      from: process.env.FROM_EMAIL as string,
      to,
      replyTo: supportEmail(),
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    if (result?.error) {
      console.error('photo email rejected by Resend', { to, error: result.error });
      return { ok: false, error: result.error.message || 'The mail provider rejected it.' };
    }

    return { ok: true };
  } catch (err) {
    console.error('photo email failed to send', { to, error: err });
    return { ok: false, error: 'Could not reach the mail provider.' };
  }
}

/* ------------------------------------------------------------- waitlist */

/**
 * Waitlist mail.
 *
 * Same rule as registration: nothing here may fail the write. By the time this
 * runs the vendor already has a place in the queue, so a bounced email is a
 * nuisance and losing their position would not be.
 *
 * The owner alert and the vendor confirmation are sent independently. One
 * failing must not take the other with it, because they serve different people.
 */
export async function notifyWaitlistJoined(v: WaitlistEmailVendor): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('email not configured, skipping waitlist mail', { email: v.email });
    return;
  }

  const owner = renderWaitlistOwnerAlert(v);
  const vendor = renderWaitlistJoined(v);

  const results = await Promise.allSettled([
    resend().emails.send({
      from: process.env.FROM_EMAIL as string,
      to: OWNER_EMAIL,
      replyTo: v.email,
      subject: owner.subject,
      html: owner.html,
      text: owner.text,
    }),
    resend().emails.send({
      from: process.env.FROM_EMAIL as string,
      to: v.email,
      replyTo: supportEmail(),
      subject: vendor.subject,
      html: vendor.html,
      text: vendor.text,
    }),
  ]);

  results.forEach((r, i) => {
    const which = i === 0 ? 'owner alert' : 'vendor confirmation';
    if (r.status === 'rejected') {
      console.error(`waitlist ${which} failed to send`, { email: v.email, error: r.reason });
    } else if (r.value?.error) {
      console.error(`waitlist ${which} rejected by Resend`, { email: v.email, error: r.value.error });
    }
  });
}

/**
 * Offer a waitlisted vendor a spot.
 *
 * Returns whether the provider accepted it, because the caller only stamps the
 * row as offered once it did. Telling the tracker someone was contacted when
 * the mail bounced would leave them silently skipped.
 */
export async function sendWaitlistOffer(
  v: WaitlistEmailVendor
): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: 'Email is not connected. Set RESEND_API_KEY and FROM_EMAIL.' };
  }

  const message = renderWaitlistOffer(v);

  try {
    const result = await resend().emails.send({
      from: process.env.FROM_EMAIL as string,
      to: v.email,
      replyTo: supportEmail(),
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result?.error) {
      console.error('waitlist offer rejected by Resend', { email: v.email, error: result.error });
      return { ok: false, error: 'The email provider rejected that address.' };
    }

    return { ok: true };
  } catch (err) {
    console.error('waitlist offer failed to send', { email: v.email, error: err });
    return { ok: false, error: 'The offer email could not be sent.' };
  }
}
