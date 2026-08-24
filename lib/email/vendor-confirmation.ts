import type { RegistrationEmail } from '../notify-types';
import { ADDRESS, NEXT_EVENT, SITE_URL } from '../seo';

/**
 * Vendor confirmation email.
 *
 * Email clients are not browsers. The rules this file follows, all deliberate:
 *
 *   Nested tables for layout. Outlook ignores flexbox and grid entirely.
 *   Every style inlined. Most clients strip anything in <head>.
 *   No CSS custom properties, for the same reason.
 *   600px maximum width, the long standing safe ceiling.
 *   No SVG. Gmail and Outlook block it, so the logo and the string lights are
 *     PNGs served from an absolute https URL on our own domain.
 *   No background images. Outlook drops them, so every panel is a solid table
 *     cell colour instead.
 *   A font stack that degrades. Web fonts do not load in most clients, so the
 *     display face falls back to Impact then Arial Black.
 *   Real alt text on every image, because images are blocked by default in a
 *     lot of inboxes and the email still has to make sense.
 *   A plain text part alongside the HTML.
 *
 * Nothing here is hardcoded per vendor. Everything renders from the data.
 */

/* Palette, repeated literally rather than shared, because custom properties do
   not survive the trip into an inbox. */
const BLACK = '#0B0B0C';
const PANEL = '#17171A';
const PANEL_2 = '#1F1F23';
const CREAM = '#F3EEE5';
const MUTED = '#B9B2A6';
const RUST = '#C4552B';
const EMBER = '#F0A94B';

const DISPLAY = "Impact, 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PHONE = '540 447 9432';
const SUPPORT = 'support@coyoteville.com';

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spotLabel(spot: string): string {
  if (spot === 'truck') return 'Food Truck Spot';
  if (spot === 'booth') return 'Vendor Booth';
  return 'Alice Organization';
}

/** One label/value row inside the details card. */
function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid #2B2B30;`;
  return `<tr>
    <td style="${border}padding:10px 0;font-family:${BODY};font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="${border}padding:10px 0 10px 16px;font-family:${BODY};font-size:15px;font-weight:bold;color:${CREAM};vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

function bullet(text: string): string {
  return `<tr>
    <td width="18" style="padding:0 0 8px;font-family:${BODY};font-size:15px;color:${EMBER};vertical-align:top;line-height:22px;">&bull;</td>
    <td style="padding:0 0 8px;font-family:${BODY};font-size:15px;line-height:22px;color:${CREAM};">${text}</td>
  </tr>`;
}

/** A section heading in the display face. */
function heading(text: string): string {
  return `<tr><td style="padding:0 0 12px;font-family:${DISPLAY};font-size:22px;line-height:26px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};">${esc(text)}</td></tr>`;
}

export function renderVendorConfirmation(r: RegistrationEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const needsPermit = r.spot_type === 'truck' || r.serves_food;
  const logo = `${SITE_URL}/email/logo-email.png`;
  const lights = `${SITE_URL}/email/lights.png`;

  const bring = [
    'Your own table, chairs, canopy and decorations.',
    'One vehicle per space.',
    ...(needsPermit
      ? [
          '<strong style="color:' +
            EMBER +
            ';">Food trucks and anyone serving food must have current food handler and health permits on site.</strong>',
        ]
      : []),
  ];

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Coyoteville spot is confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:${BLACK};">
<!-- Preheader. Shown in the inbox list, hidden in the message body. -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BLACK};">
Your spot at Coyoteville is confirmed for ${esc(NEXT_EVENT.displayDate)}. Gates at ${esc(NEXT_EVENT.displayTime)}.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLACK};">
<tr><td align="center" style="padding:0;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:${BLACK};">

  <!-- header -->
  <tr>
    <td align="center" style="padding:32px 24px 8px;background-color:${BLACK};">
      <img src="${logo}" width="220" alt="Coyoteville, food truck park and live music, Alice, Texas" style="display:block;width:220px;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>
  <tr>
    <td style="padding:0;font-size:0;line-height:0;background-color:${BLACK};">
      <img src="${lights}" width="600" alt="String lights strung across the lot" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
    </td>
  </tr>

  <!-- headline -->
  <tr>
    <td align="center" style="padding:20px 24px 6px;background-color:${BLACK};">
      <div style="font-family:${DISPLAY};font-size:34px;line-height:38px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};">Your spot is confirmed</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 24px 26px;background-color:${BLACK};">
      <div style="font-family:${BODY};font-size:16px;line-height:24px;color:${MUTED};">
        We have your signed agreement. Here is everything you need for ${esc(NEXT_EVENT.displayDate)}.
      </div>
    </td>
  </tr>

  <!-- details card -->
  <tr>
    <td style="padding:0 24px 26px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${EMBER};">
        <tr><td style="padding:20px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${detailRow('Business', r.business_name)}
            ${detailRow('Spot', spotLabel(r.spot_type))}
            ${detailRow('Event', r.event_name)}
            ${detailRow('Date', NEXT_EVENT.displayDate)}
            ${detailRow('Gates open', NEXT_EVENT.displayTime)}
            ${detailRow('Where', `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state}`, true)}
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- what to bring -->
  <tr>
    <td style="padding:0 24px 24px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${heading('What to bring')}
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${bring.map(bullet).join('')}
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- game night -->
  <tr>
    <td style="padding:0 24px 26px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL_2};">
        <tr><td style="padding:20px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${heading('Game night')}
            <tr><td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet('Admission is free and open to everyone.')}
                ${bullet('Shuttles run to the stadium once the game starts.')}
                ${bullet('Parking opens on the lot at kickoff for $10 per vehicle.')}
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- thank you from the CEO -->
  <tr>
    <td style="padding:0 24px 28px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border:2px solid ${RUST};">
        <tr><td style="padding:24px 22px;">
          <div style="font-family:${BODY};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${EMBER};padding-bottom:12px;">Thank you</div>

          <div style="font-family:${BODY};font-size:15px;line-height:24px;color:${CREAM};padding-bottom:14px;">
            Thank you for taking a chance on something new in this town.
          </div>
          <div style="font-family:${BODY};font-size:15px;line-height:24px;color:${MUTED};padding-bottom:14px;">
            We bought a vacant lot across from the stadium because Alice deserved somewhere to
            gather. The only reason any of it works is local businesses like yours showing up and
            setting up.
          </div>
          <div style="font-family:${BODY};font-size:15px;line-height:24px;color:${MUTED};padding-bottom:20px;">
            We will see you Friday.
          </div>

          <div style="font-family:${DISPLAY};font-size:30px;line-height:34px;color:${EMBER};padding-bottom:4px;">Robert Reyna</div>
          <div style="font-family:${BODY};font-size:13px;line-height:19px;color:${CREAM};">
            Chief Executive Officer<br />Coyoteville Alice LLC
          </div>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- contact -->
  <tr>
    <td style="padding:0 24px 8px;background-color:${BLACK};border-top:1px solid #2B2B30;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding:22px 0 6px;font-family:${BODY};font-size:15px;line-height:24px;color:${CREAM};">
          <a href="tel:5404479432" style="color:${EMBER};text-decoration:none;">${PHONE}</a>
          &nbsp;&middot;&nbsp;
          <a href="mailto:${SUPPORT}" style="color:${EMBER};text-decoration:none;">${SUPPORT}</a>
        </td></tr>
        <tr><td align="center" style="padding:0 0 6px;font-family:${BODY};font-size:14px;line-height:22px;">
          <a href="${SITE_URL}" style="color:${MUTED};text-decoration:underline;">coyoteville.com</a>
        </td></tr>
        <tr><td align="center" style="padding:0 0 30px;font-family:${BODY};font-size:12px;line-height:18px;color:#7C766C;">
          ${esc(ADDRESS.street)}, ${esc(ADDRESS.city)}, ${esc(ADDRESS.state)} ${esc(ADDRESS.zip)}
        </td></tr>
      </table>
    </td>
  </tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'YOUR SPOT IS CONFIRMED',
    '',
    `We have your signed agreement. Here is everything you need for ${NEXT_EVENT.displayDate}.`,
    '',
    `Business:    ${r.business_name}`,
    `Spot:        ${spotLabel(r.spot_type)}`,
    `Event:       ${r.event_name}`,
    `Date:        ${NEXT_EVENT.displayDate}`,
    `Gates open:  ${NEXT_EVENT.displayTime}`,
    `Where:       ${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state}`,
    '',
    'WHAT TO BRING',
    '- Your own table, chairs, canopy and decorations.',
    '- One vehicle per space.',
    ...(needsPermit
      ? ['- Food trucks and anyone serving food must have current food handler and health permits on site.']
      : []),
    '',
    'GAME NIGHT',
    '- Admission is free and open to everyone.',
    '- Shuttles run to the stadium once the game starts.',
    '- Parking opens on the lot at kickoff for $10 per vehicle.',
    '',
    'THANK YOU',
    'Thank you for taking a chance on something new in this town.',
    '',
    'We bought a vacant lot across from the stadium because Alice deserved somewhere',
    'to gather. The only reason any of it works is local businesses like yours showing',
    'up and setting up.',
    '',
    'We will see you Friday.',
    '',
    'Robert Reyna',
    'Chief Executive Officer',
    'Coyoteville Alice LLC',
    '',
    `${PHONE} · ${SUPPORT}`,
    SITE_URL,
    `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.zip}`,
  ].join('\n');

  return {
    subject: `Your Coyoteville spot is confirmed for ${NEXT_EVENT.displayDate}`,
    html,
    text,
  };
}
