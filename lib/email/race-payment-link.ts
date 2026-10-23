import { esc, logoHeader, preheader } from './shared';

/**
 * The payment link a runner is sent after the fact.
 *
 * Somebody who gets this has already registered and signed. They are not being
 * asked to do any of it again, and the email has to say so in the first line,
 * because the natural reading of an email with a pay button in it is that the
 * first attempt did not count.
 *
 * It names the amount before the button. A link that just says "pay" asks
 * somebody to click through to find out what they owe.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type RacePaymentLink = {
  firstName: string;
  /** Who is reading. Differs from firstName when a guardian is paying. */
  greetingName: string;
  /** Set when the email is going to a guardian rather than the runner. */
  runnerName: string | null;
  raceName: string;
  displayDate: string;
  displayTime: string;
  amountLabel: string;
  payUrl: string;
  supportEmail: string;
};

export function renderRacePaymentLink(r: RacePaymentLink): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your spot in the ${r.raceName}: payment link`;

  const opening = r.runnerName
    ? `${r.runnerName} is registered for the ${r.raceName} and the entry has not been paid yet.`
    : `You are registered for the ${r.raceName} and your entry has not been paid yet.`;

  const text = [
    `${r.greetingName},`,
    '',
    opening,
    'Everything you filled in is saved, including the waiver. You do not need to register again.',
    '',
    `  Race: ${r.raceName}, ${r.displayDate} at ${r.displayTime}`,
    `  Amount due: ${r.amountLabel}`,
    '',
    'Pay here:',
    r.payUrl,
    '',
    'The spot is not held until the entry is paid.',
    `Questions: ${r.supportEmail}`,
  ].join('\n');

  const html = [
    '<!doctype html><html><body style="margin:0;padding:0;background:#f7f0de;">',
    preheader(`${r.amountLabel} to finish your entry. Your registration is already saved.`),
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"',
    ' style="background:#f7f0de;padding:24px 12px;"><tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"',
    ` style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${BODY};">`,
    `<tr><td>${logoHeader('#17222e')}</td></tr>`,
    '<tr><td style="padding:28px 28px 8px 28px;">',
    `<p style="margin:0 0 14px 0;font-size:16px;color:#17222e;">${esc(r.greetingName)},</p>`,
    `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.5;color:#17222e;">${esc(opening)}</p>`,
    '<p style="margin:0 0 20px 0;font-size:16px;line-height:1.5;color:#17222e;">',
    'Everything you filled in is saved, including the waiver. You do not need to register again.',
    '</p>',
    '</td></tr>',
    '<tr><td style="padding:0 28px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"',
    ' style="background:#f7f0de;border-radius:10px;">',
    '<tr><td style="padding:16px 18px;">',
    '<p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#5b6670;">Amount due</p>',
    `<p style="margin:0 0 10px 0;font-size:30px;font-weight:700;color:#17222e;">${esc(r.amountLabel)}</p>`,
    `<p style="margin:0;font-size:15px;color:#17222e;">${esc(r.raceName)}<br/>${esc(r.displayDate)} at ${esc(r.displayTime)}</p>`,
    '</td></tr></table>',
    '</td></tr>',
    '<tr><td align="center" style="padding:22px 28px 6px 28px;">',
    `<a href="${esc(r.payUrl)}"`,
    ' style="display:inline-block;background:#e8541f;color:#ffffff;text-decoration:none;',
    'font-size:17px;font-weight:700;padding:15px 34px;border-radius:8px;">Pay now</a>',
    '</td></tr>',
    '<tr><td style="padding:10px 28px 26px 28px;">',
    '<p style="margin:0 0 10px 0;font-size:14px;line-height:1.5;color:#5b6670;">',
    'The spot is not held until the entry is paid.',
    '</p>',
    '<p style="margin:0;font-size:13px;line-height:1.5;color:#5b6670;word-break:break-all;">',
    `If the button does not work, open this: ${esc(r.payUrl)}`,
    '</p>',
    `<p style="margin:14px 0 0 0;font-size:13px;color:#5b6670;">Questions: ${esc(r.supportEmail)}</p>`,
    '</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join('');

  return { subject, html, text };
}
