import type { RegistrationEmail } from '../notify-types';
import { ADDRESS, NEXT_EVENT, SITE_URL } from '../seo';
import { LOGO_ALT, LOGO_URL, preheader } from './shared';
import {
  NEXT_STEPS_CONTACT,
  NEXT_STEPS_HEADING,
  NEXT_STEPS_SHARED,
  nextStepsFor,
} from '../next-steps';

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

export function renderVendorConfirmation(
  r: RegistrationEmail,
  /** Public contact address, injected by the caller from SUPPORT_EMAIL. */
  SUPPORT: string
): {
  subject: string;
  html: string;
  text: string;
} {
  const needsPermit = r.spot_type === 'truck' || r.serves_food;

  /* When they are actually setting up.
     This used to be NEXT_EVENT for everybody, which is correct for an event
     booking and wrong for the other two: a vendor approved for one ordinary
     Tuesday, or for a permanent spot, was being told the date of an event they
     had not booked. The caller passes what was really booked and the calendar
     is only consulted when it did not. */
  const monthly = r.booking_kind === 'monthly';
  const whenLabel = r.booking_when || NEXT_EVENT.displayDate;
  const gatesLabel = monthly ? 'Every day we are open' : NEXT_EVENT.displayTime;
  const logo = LOGO_URL;
  const lights = `${SITE_URL}/email/lights.png`;

  // Same config the confirmation screen reads, so the two cannot drift.
  const nextStepsBlock = nextStepsFor(r.spot_type);

  const bring = [
    'Your own table, chairs, canopy and decorations.',
    'One vehicle per space.',
    ...(needsPermit
      ? [
          '<strong style="color:' +
            EMBER +
            ';">Food trucks must bring their Texas DSHS health permit and food handler certificates on site. Anyone else serving food must bring their permit.</strong>',
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
${preheader(`Your spot is confirmed for ${whenLabel}. Setup opens at 8 AM.`)}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLACK};">
<tr><td align="center" style="padding:0;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:${BLACK};">

  <!-- header -->
  <tr>
    <td align="center" style="padding:32px 24px 8px;background-color:${BLACK};">
      <img src="${logo}" width="260" alt="${LOGO_ALT}" style="display:block;width:260px;max-width:260px;height:auto;border:0;outline:none;text-decoration:none;" />
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
        We have your signed agreement. Here is everything you need for ${esc(whenLabel)}.
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
            ${detailRow(monthly ? 'Runs' : 'Date', whenLabel)}
            ${detailRow('Gates open', gatesLabel)}
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
                ${bullet('Parking opens on the lot at kickoff for $10 per vehicle.')}
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- what happens next -->
  <tr>
    <td style="padding:0 24px 26px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${RUST};">
        <tr><td style="padding:20px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${heading(NEXT_STEPS_HEADING)}
            <tr><td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${NEXT_STEPS_SHARED.map((i) => bullet(esc(i))).join('')}
              </table>
            </td></tr>

            ${
              nextStepsBlock
                ? `<tr><td style="padding:16px 0 0;">
                     <div style="font-family:${BODY};font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${EMBER};padding:14px 0 10px;border-top:1px solid #2B2B30;">${esc(nextStepsBlock.heading)}</div>
                     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                       ${nextStepsBlock.items.map((i) => bullet(esc(i))).join('')}
                     </table>
                   </td></tr>`
                : ''
            }

            <tr><td style="padding:16px 0 0;border-top:1px solid #2B2B30;font-family:${BODY};font-size:15px;line-height:22px;font-weight:bold;color:${CREAM};">
              ${esc(NEXT_STEPS_CONTACT)}
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
    `We have your signed agreement. Here is everything you need for ${whenLabel}.`,
    '',
    `Business:    ${r.business_name}`,
    `Spot:        ${spotLabel(r.spot_type)}`,
    `Event:       ${r.event_name}`,
    `${monthly ? 'Runs:        ' : 'Date:        '}${whenLabel}`,
    `Gates open:  ${gatesLabel}`,
    `Where:       ${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state}`,
    '',
    'WHAT TO BRING',
    '- Your own table, chairs, canopy and decorations.',
    '- One vehicle per space.',
    ...(needsPermit
      ? [
          '- Food trucks must bring their Texas DSHS health permit and food handler certificates on site.',
          '- Anyone else serving food must bring their permit.',
        ]
      : []),
    '',
    'GAME NIGHT',
    '- Admission is free and open to everyone.',
    '- Parking opens on the lot at kickoff for $10 per vehicle.',
    '',
    NEXT_STEPS_HEADING.toUpperCase(),
    ...NEXT_STEPS_SHARED.map((i) => `- ${i}`),
    ...(nextStepsBlock
      ? ['', nextStepsBlock.heading.toUpperCase(), ...nextStepsBlock.items.map((i) => `- ${i}`)]
      : []),
    '',
    NEXT_STEPS_CONTACT,
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
    subject: `Your spot is confirmed for ${whenLabel}`,
    html,
    text,
  };
}
