import { esc, logoHeader, preheader } from './shared';

/**
 * Where a vendor stands, in one line, with the lot map attached.
 *
 * Sent the day before. It has one job and the subject line does most of it:
 * somebody checking mail on a phone should know their spot without opening
 * anything. Everything else on the page is what they asked at signup and would
 * otherwise text to ask again.
 *
 * The map is a real attachment rather than a link. A signed URL expires and a
 * vendor opens this in a lot with no signal, which is exactly when a link fails
 * and a saved image does not.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PHONE = '540 447 9432';

function shell(title: string, inner: string, preview: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader(preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">
${inner}
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

export function renderSpotAssignment(opts: {
  businessName: string;
  spot: string;
  eventName: string;
  eventDate: string;
  openTime: string;
  setupTime: string;
  hasMap: boolean;
  supportEmail: string;
}): { subject: string; html: string; text: string } {
  const { businessName, spot, eventName, eventDate, openTime, setupTime, hasMap, supportEmail } =
    opts;

  const mapLine = hasMap
    ? 'The lot map is attached. Your spot is marked on it.'
    : 'Staff will point you to it when you arrive.';

  const lines = [
    `${businessName}, you are in ${spot}.`,
    '',
    `${eventName}, ${eventDate}.`,
    `Setup opens at ${setupTime}. We open to the public at ${openTime}.`,
    '',
    mapLine,
    '',
    'Pull in, find your number, and set up inside it. If somebody is in your',
    'space, do not move them yourself. Find Coyoteville staff and we will sort it.',
    '',
    `Anything at all, call or text ${PHONE}, or email ${supportEmail}.`,
    '',
    'Robert',
    'Coyoteville',
    PHONE,
  ];

  const inner = `
    <p style="margin:0 0 6px;color:#666666;font-size:14px;">${esc(businessName)}</p>
    <p style="margin:0 0 18px;font-family:${BODY};font-size:34px;line-height:1.1;font-weight:bold;color:#111111;">You are in ${esc(spot)}</p>
    <p style="margin:0 0 14px;"><strong>${esc(eventName)}</strong>, ${esc(eventDate)}.<br />Setup opens at ${esc(setupTime)}. We open to the public at ${esc(openTime)}.</p>
    <p style="margin:0 0 14px;">${esc(mapLine)}</p>
    <p style="margin:0 0 14px;">Pull in, find your number, and set up inside it. If somebody is in your space, do not move them yourself. Find Coyoteville staff and we will sort it.</p>
    <p style="margin:0 0 18px;color:#555555;font-size:14px;">Anything at all, call or text ${esc(PHONE)} or email <a href="mailto:${esc(supportEmail)}" style="color:#C4552B;">${esc(supportEmail)}</a>.</p>
    <p style="margin:0;color:#555555;font-size:14px;">Robert<br />Coyoteville<br />${esc(PHONE)}</p>`;

  return {
    /* The spot is in the subject, so a phone lock screen answers the question
       without the mail being opened at all. */
    subject: `Your spot for ${eventName}: ${spot}`,
    html: shell(`Your spot: ${spot}`, inner, `${businessName}, you are in ${spot}.`),
    text: lines.join('\n'),
  };
}
