import { esc, logoHeader, preheader } from './shared';

/**
 * What a runner gets after they register.
 *
 * The two things they will come back to this email for are the check in time
 * and what they have to bring, so both are near the top and neither is buried
 * in a paragraph. Everything else is confirmation of what they bought.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type RaceConfirmation = {
  firstName: string;
  raceName: string;
  /** "Saturday, November 14, 2026". */
  displayDate: string;
  /** "8:00 AM". */
  displayTime: string;
  /** "7:00 AM". Derived from registration_closes_at, never typed. */
  checkInTime: string;
  distanceLabel: string;
  tierLabel: string;
  shirtSize: string | null;
  includes: string[];
  packetPickup: string;
  locationName: string;
  locationAddress: string;
  chipTimed: boolean;
  raceUrl: string;
  supportEmail: string;
};

export function renderRaceConfirmation(r: RaceConfirmation): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You are in: ${r.raceName}, ${r.displayDate}`;

  const facts: [string, string][] = [
    ['Race', `${r.raceName}, ${r.distanceLabel}`],
    ['When', `${r.displayDate} at ${r.displayTime}`],
    ['Where', `${r.locationName}, ${r.locationAddress}`],
    ['Entry', r.tierLabel],
    ['Shirt', r.shirtSize ? r.shirtSize : 'No shirt on this entry'],
  ];

  const text = [
    `${r.firstName}, you are registered.`,
    '',
    ...facts.map(([k, v]) => `  ${k}: ${v}`),
    '',
    `CHECK IN BY ${r.checkInTime}`,
    `  ${r.packetPickup}`,
    '',
    'YOUR ENTRY INCLUDES',
    ...r.includes.map((i) => `  ${i}`),
    '',
    r.chipTimed
      ? ''
      : 'This year is not chip timed, so there are no official results or finish time awards.',
    '',
    r.raceUrl,
    `Questions: ${r.supportEmail}`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader(`${r.displayDate} at ${r.displayTime}. Check in by ${r.checkInTime}.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:23px;color:#111111;">
    <p style="margin:0 0 6px;font-size:26px;line-height:1.15;font-weight:bold;color:#111111;">${esc(r.firstName)}, you are in.</p>
    <p style="margin:0 0 18px;color:#444448;">${esc(r.raceName)}, ${esc(r.displayDate)}.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BODY};font-size:15px;">
${facts
  .map(
    ([k, v]) =>
      `      <tr><td width="90" valign="top" style="padding:7px 0;border-top:1px solid #E4E4E7;color:#555555;">${esc(k)}</td>` +
      `<td valign="top" style="padding:7px 0;border-top:1px solid #E4E4E7;color:#111111;">${esc(v)}</td></tr>`
  )
  .join('\n')}
    </table>

    <p style="margin:24px 0 6px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6B6B72;">Check in by ${esc(r.checkInTime)}</p>
    <p style="margin:0 0 6px;">${esc(r.packetPickup)}</p>
    <p style="margin:0 0 18px;color:#C4552B;"><b>Every runner has to be checked in by ${esc(r.checkInTime)} for a ${esc(r.displayTime)} start.</b></p>

    <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6B6B72;">Your entry includes</p>
    <ul style="margin:0 0 18px;padding-left:20px;">
${r.includes.map((i) => `      <li style="margin:0 0 4px;">${esc(i)}</li>`).join('\n')}
    </ul>

    ${
      r.chipTimed
        ? ''
        : `<p style="margin:0 0 18px;color:#555555;font-size:14px;">This year is not chip timed, so there are no official results, splits or finish time awards.</p>`
    }

    <p style="margin:0 0 6px;font-size:14px;"><a href="${esc(r.raceUrl)}" style="color:#C4552B;">Everything about the race</a></p>
    <p style="margin:0;color:#555555;font-size:14px;">Questions, reply to this or email <a href="mailto:${esc(r.supportEmail)}" style="color:#C4552B;">${esc(r.supportEmail)}</a>.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
