import { ADDRESS, PRICING, SITE_URL } from '../seo';
import { LOGO_ALT, LOGO_URL, emailAsset, esc, preheader } from './shared';

/**
 * Waitlist email. Three messages, one file.
 *
 *   joined      To the vendor. You are on the list, here is where you stand.
 *   ownerAlert  To us. Someone joined, with their details.
 *   offer       To the vendor. A spot opened, here is the link to take it.
 *
 * Same rules as the other templates, because these land in the same inboxes:
 * nested tables rather than flexbox or grid, every style inlined, a 600px
 * ceiling with an MSO ghost table, PNG images on absolute https URLs, solid
 * panel colours because Outlook drops background images, real alt text, a
 * preheader as the first element in the body, and a plain text part.
 *
 * The vendor facing two are deliberately short. Someone who has just been told
 * they did not get a spot does not need a page of logistics, and the offer
 * email has exactly one job: get them to the form before the spot goes.
 */

const BLACK = '#0B0B0C';
const PANEL = '#17171A';
const CREAM = '#F3EEE5';
const MUTED = '#B9B2A6';
const RUST = '#C4552B';
const EMBER = '#F0A94B';
const RULE = '#2B2B30';

const DISPLAY = "Impact, 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PHONE = '540 447 9432';

export function spotLabel(spot: string): string {
  if (spot === 'truck') return PRICING.truck.label;
  if (spot === 'booth') return PRICING.booth.label;
  return PRICING.free.label;
}

export type WaitlistEmailVendor = {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  spotType: string;
  sells: string;
  position: number;
  eventName: string;
  eventDate: string;
  eventSlug: string;
};

/* ------------------------------------------------------------- chrome */

function shell(title: string, preview: string, inner: string): string {
  const lights = emailAsset('/email/lights.png');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BLACK};">
${preheader(preview)}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLACK};">
<tr><td align="center" style="padding:0;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:${BLACK};">

  <tr>
    <td align="center" style="padding:32px 24px 8px;background-color:${BLACK};">
      <img src="${LOGO_URL}" width="240" alt="${LOGO_ALT}" style="display:block;width:240px;max-width:240px;height:auto;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>
  <tr>
    <td style="padding:0;font-size:0;line-height:0;background-color:${BLACK};">
      <img src="${lights}" width="600" alt="String lights strung across the lot" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
    </td>
  </tr>

  ${inner}

  <tr>
    <td style="padding:0 24px;background-color:${BLACK};border-top:1px solid ${RULE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding:22px 0 6px;font-family:${BODY};font-size:14px;line-height:22px;color:${CREAM};">
          <a href="tel:5404479432" style="color:${EMBER};text-decoration:none;">${PHONE}</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE_URL}" style="color:${MUTED};text-decoration:underline;">coyoteville.com</a>
        </td></tr>
        <tr><td align="center" style="padding:0 0 28px;font-family:${BODY};font-size:12px;line-height:18px;color:#7C766C;">
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
}

function headline(text: string, sub: string): string {
  return `<tr>
    <td align="center" style="padding:22px 24px 6px;background-color:${BLACK};">
      <div style="font-family:${DISPLAY};font-size:30px;line-height:34px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};">${esc(text)}</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 24px 24px;background-color:${BLACK};">
      <div style="font-family:${BODY};font-size:16px;line-height:24px;color:${MUTED};">${esc(sub)}</div>
    </td>
  </tr>`;
}

function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${RULE};`;
  return `<tr>
    <td style="${border}padding:10px 0;font-family:${BODY};font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="${border}padding:10px 0 10px 16px;font-family:${BODY};font-size:15px;font-weight:bold;color:${CREAM};vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

function card(rows: string, accent = EMBER): string {
  return `<tr>
    <td style="padding:0 24px 24px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${accent};">
        <tr><td style="padding:20px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

/** A real bulletproof button: a table cell, not a styled anchor. */
function button(href: string, label: string): string {
  return `<tr>
    <td align="center" style="padding:0 24px 26px;background-color:${BLACK};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="${RUST}" style="border-radius:4px;">
          <a href="${href}" style="display:inline-block;padding:16px 28px;font-family:${BODY};font-size:16px;font-weight:bold;line-height:20px;color:${CREAM};text-decoration:none;border-radius:4px;">${esc(label)}</a>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

function note(text: string): string {
  return `<tr>
    <td style="padding:0 24px 26px;background-color:${BLACK};">
      <div style="font-family:${BODY};font-size:14px;line-height:22px;color:${MUTED};">${text}</div>
    </td>
  </tr>`;
}

/* ------------------------------------------------- 1. joined, to vendor */

export function renderWaitlistJoined(v: WaitlistEmailVendor): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You are on the Coyoteville waitlist for ${v.eventName}`;

  const inner =
    headline('You are on the waitlist', `We will contact you if a spot opens for ${v.eventDate}.`) +
    card(
      detailRow('Business', v.businessName) +
        detailRow('Event', `${v.eventName}, ${v.eventDate}`) +
        detailRow('Spot wanted', spotLabel(v.spotType)) +
        detailRow('Your place in line', `Number ${v.position}`, true)
    ) +
    note(
      `<strong style="color:${CREAM};">This is a waitlist, not a confirmed spot.</strong> ` +
        'Nothing has been charged and no space is being held. If someone cancels or we open more ' +
        'room, we work down the list in order and email you a link to register and pay. ' +
        'You do not need to do anything until then.'
    );

  const text = [
    'YOU ARE ON THE WAITLIST',
    '',
    `We will contact you if a spot opens for ${v.eventDate}.`,
    '',
    `Business:            ${v.businessName}`,
    `Event:               ${v.eventName}, ${v.eventDate}`,
    `Spot wanted:         ${spotLabel(v.spotType)}`,
    `Your place in line:  Number ${v.position}`,
    '',
    'This is a waitlist, not a confirmed spot. Nothing has been charged and no',
    'space is being held. If someone cancels or we open more room, we work down',
    'the list in order and email you a link to register and pay. You do not need',
    'to do anything until then.',
    '',
    `${PHONE} · ${SITE_URL}`,
    `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.zip}`,
  ].join('\n');

  return {
    subject,
    html: shell(subject, `You are number ${v.position} for ${v.eventName}. Nothing is charged.`, inner),
    text,
  };
}

/* --------------------------------------------------- 2. alert, to owner */

export function renderWaitlistOwnerAlert(v: WaitlistEmailVendor): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Waitlist: ${v.businessName}, number ${v.position}, ${v.eventName}`;

  const inner =
    headline('New waitlist signup', `${v.businessName} is number ${v.position} for ${v.eventName}.`) +
    card(
      detailRow('Business', v.businessName) +
        detailRow('Contact', v.contactName) +
        detailRow('Phone', v.phone) +
        detailRow('Email', v.email) +
        detailRow('Spot wanted', spotLabel(v.spotType)) +
        detailRow('Sells', v.sells) +
        detailRow('Event', `${v.eventName}, ${v.eventDate}`) +
        detailRow('Position', `Number ${v.position}`, true),
      RUST
    ) +
    note(
      `Offer them a spot from the tracker: <a href="${SITE_URL}/admin?event=${encodeURIComponent(v.eventSlug)}" style="color:${EMBER};">open the waitlist</a>.`
    );

  const text = [
    'NEW WAITLIST SIGNUP',
    '',
    `Business:     ${v.businessName}`,
    `Contact:      ${v.contactName}`,
    `Phone:        ${v.phone}`,
    `Email:        ${v.email}`,
    `Spot wanted:  ${spotLabel(v.spotType)}`,
    `Sells:        ${v.sells}`,
    `Event:        ${v.eventName}, ${v.eventDate}`,
    `Position:     Number ${v.position}`,
    '',
    `${SITE_URL}/admin?event=${encodeURIComponent(v.eventSlug)}`,
  ].join('\n');

  return {
    subject,
    html: shell(subject, `${v.businessName}, ${spotLabel(v.spotType)}, number ${v.position}.`, inner),
    text,
  };
}

/* --------------------------------------------------- 3. offer, to vendor */

/** Where an offered vendor goes to finish. The form preselects the event. */
export function registrationLink(eventSlug: string): string {
  return `${SITE_URL}/?event=${encodeURIComponent(eventSlug)}#apply`;
}

export function renderWaitlistOffer(v: WaitlistEmailVendor): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `A spot opened at Coyoteville for ${v.eventDate}`;
  const link = registrationLink(v.eventSlug);
  const label = spotLabel(v.spotType);

  const inner =
    headline('A spot opened', `${label} for ${v.eventName}, ${v.eventDate}.`) +
    card(
      detailRow('Business', v.businessName) +
        detailRow('Spot', label) +
        detailRow('Event', `${v.eventName}, ${v.eventDate}`, true)
    ) +
    note(
      `<strong style="color:${CREAM};">Your spot is not held until you register and pay.</strong> ` +
        'We work down the waitlist in order, so it goes to the next business if it is not taken.'
    ) +
    button(link, 'Register and pay') +
    note(
      `If the button does not work, paste this into your browser:<br /><a href="${link}" style="color:${EMBER};word-break:break-all;">${esc(link)}</a>`
    );

  const text = [
    'A SPOT OPENED',
    '',
    `${label} for ${v.eventName}, ${v.eventDate}.`,
    '',
    `Business:  ${v.businessName}`,
    `Spot:      ${label}`,
    `Event:     ${v.eventName}, ${v.eventDate}`,
    '',
    'Your spot is not held until you register and pay. We work down the waitlist',
    'in order, so it goes to the next business if it is not taken.',
    '',
    'Register and pay:',
    link,
    '',
    `${PHONE} · ${SITE_URL}`,
  ].join('\n');

  return {
    subject,
    html: shell(subject, `${label} for ${v.eventDate}. Register to take it.`, inner),
    text,
  };
}
