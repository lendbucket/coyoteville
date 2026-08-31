import { esc, logoHeader, preheader } from './shared';

/**
 * The payment link the admin sends by hand from the tracker.
 *
 * Not a reminder and deliberately not written like one. lib/email/reminder.ts
 * chases somebody who walked away from checkout minutes ago and its job is to
 * say the spot is not held. This one goes to a vendor who is already in, who
 * signed up through a path that has since been retired, and who has simply
 * never been asked for money. Robert knows these people and will stand next to
 * them in the lot, so it reads as a friendly nudge with a button on it.
 *
 * Nothing here sends itself. It renders when the admin taps the action and at
 * no other time.
 *
 * Two rules the copy has to hold to:
 *
 *   No dashes of any kind beyond the hyphen, and no emoji. Checked by
 *   scripts/check-email-copy.js so it stays true after an edit.
 *
 *   An approved row is told its spot is reserved. A row still in the review
 *   queue is not, because promising a spot nobody has granted is the exact
 *   thing the queue exists to stop. One sentence differs; the rest is shared.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PHONE = '540 447 9432';

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function renderPaymentRequest(opts: {
  businessName: string;
  contactName: string;
  /** The event or date they booked, already formatted. */
  eventLabel: string;
  spotLabel: string;
  amountCents: number;
  payUrl: string;
  /** True only when the application has actually been approved. */
  approved: boolean;
  supportEmail: string;
}): { subject: string; html: string; text: string } {
  const {
    businessName,
    contactName,
    eventLabel,
    spotLabel,
    amountCents,
    payUrl,
    approved,
    supportEmail,
  } = opts;

  const amount = money(amountCents);
  const firstName = contactName.trim().split(/\s+/)[0] || contactName.trim();

  /* The one sentence that changes. "Reserved" is a promise, so it is only made
     where the row says it has been granted. */
  const standing = approved
    ? `Your spot at ${eventLabel} is reserved and we are holding it for you.`
    : `We have your application and your signed agreement for ${eventLabel}.`;

  /* And the sentence after the button, for the same reason. An approved vendor
     really is done once they pay. A vendor still in the review queue is not,
     and telling them there is nothing else to do would be the tracker making a
     promise the queue exists to withhold. */
  const closing = approved
    ? 'Once it goes through, you are all set and there is nothing else to do before the event.'
    : 'Once it goes through, we finish reviewing your application and email you either way.';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Coyoteville payment link</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader(`${amount} for ${eventLabel}. Here is the link to pay.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">

    <p style="margin:0 0 14px;">Hi ${esc(firstName)},</p>

    <p style="margin:0 0 14px;">
      ${esc(standing)} We have not received the payment for it yet, so here is
      the link.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr>
        <td style="padding:4px 14px 4px 0;color:#666666;font-family:${BODY};font-size:14px;">Event</td>
        <td style="padding:4px 0;font-family:${BODY};font-size:14px;"><strong>${esc(eventLabel)}</strong></td>
      </tr>
      <tr>
        <td style="padding:4px 14px 4px 0;color:#666666;font-family:${BODY};font-size:14px;">Spot</td>
        <td style="padding:4px 0;font-family:${BODY};font-size:14px;"><strong>${esc(spotLabel)}</strong></td>
      </tr>
      <tr>
        <td style="padding:4px 14px 4px 0;color:#666666;font-family:${BODY};font-size:14px;">Amount</td>
        <td style="padding:4px 0;font-family:${BODY};font-size:14px;"><strong>${esc(amount)}</strong></td>
      </tr>
    </table>

    <p style="margin:0 0 20px;">
      <a href="${payUrl}" style="display:inline-block;background-color:#C4552B;color:#FFFFFF;font-family:${BODY};font-size:16px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:4px;">Pay ${esc(amount)} now</a>
    </p>

    <p style="margin:0 0 16px;">
      It takes about a minute and Square emails you the receipt. ${esc(closing)}
    </p>

    <p style="margin:0 0 18px;color:#555555;font-size:14px;">
      If you would rather pay another way, or if something about this does not
      look right, just call or text ${esc(PHONE)} or email
      <a href="mailto:${esc(supportEmail)}" style="color:#C4552B;">${esc(supportEmail)}</a>.
      Happy to sort it out.
    </p>

    <p style="margin:0;color:#555555;font-size:14px;">Thanks ${esc(firstName)},<br />Robert<br />Coyoteville<br />${esc(PHONE)}</p>

  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    `Hi ${firstName},`,
    '',
    `${standing} We have not received the payment for it yet, so here is the link.`,
    '',
    `Event:  ${eventLabel}`,
    `Spot:   ${spotLabel}`,
    `Amount: ${amount}`,
    '',
    `Pay ${amount} here:`,
    payUrl,
    '',
    `It takes about a minute and Square emails you the receipt. ${closing}`,
    '',
    `If you would rather pay another way, or if something about this does not look right, just call or text ${PHONE} or email ${supportEmail}. Happy to sort it out.`,
    '',
    `Thanks ${firstName},`,
    'Robert',
    'Coyoteville',
    PHONE,
  ].join('\n');

  return {
    subject: `Your payment link for ${businessName}, ${eventLabel}`,
    html,
    text,
  };
}

