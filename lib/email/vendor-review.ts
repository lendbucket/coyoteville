import type { RegistrationEmail } from '../notify-types';
import { ADDRESS, SITE_URL } from '../seo';
import { REFUND_WINDOW, REVIEW_WINDOW } from '../approval';
import { LOGO_ALT, LOGO_URL, esc, preheader } from './shared';

/**
 * The two emails either side of a review decision.
 *
 * "We have your application" goes out when the money settles. It is
 * deliberately not a confirmation: the vendor has bought a place in the queue,
 * not a spot, and this is the message that has to say so without reading like a
 * rejection.
 *
 * "We could not fit you in" goes out on a denial. It carries the reason the
 * admin typed, verbatim, and the refund. The refund is the part that actually
 * matters to the person reading it, so it comes before the reason rather than
 * after.
 *
 * Same email client rules as vendor-confirmation.ts: nested tables, everything
 * inlined, 600px, no SVG, no background images, a plain text part alongside.
 */

const BLACK = '#0B0B0C';
const PANEL = '#17171A';
const CREAM = '#F3EEE5';
const MUTED = '#B9B2A6';
const RUST = '#C4552B';
const EMBER = '#F0A94B';

const DISPLAY = "Impact, 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PHONE = '540 447 9432';

function spotLabel(spot: string): string {
  if (spot === 'truck') return 'Food Truck Spot';
  if (spot === 'booth') return 'Vendor Booth';
  return 'Alice Organization';
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : 'border-bottom:1px solid #2B2B30;';
  return `<tr>
    <td style="${border}padding:10px 0;font-family:${BODY};font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="${border}padding:10px 0 10px 16px;font-family:${BODY};font-size:15px;font-weight:bold;color:${CREAM};vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

/**
 * The shared shell. Both messages are a headline, a standfirst, a details card
 * and a stack of panels, so the frame is written once and each template only
 * supplies what differs.
 */
function shell(args: {
  title: string;
  preview: string;
  headline: string;
  standfirst: string;
  /** Accent down the left of the details card. */
  accent: string;
  details: string;
  body: string;
  support: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(args.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BLACK};">
${preheader(args.preview)}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLACK};">
<tr><td align="center" style="padding:0;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:${BLACK};">

  <tr>
    <td align="center" style="padding:32px 24px 18px;background-color:${BLACK};">
      <img src="${LOGO_URL}" width="230" alt="${LOGO_ALT}" style="display:block;width:230px;max-width:230px;height:auto;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>

  <tr>
    <td align="center" style="padding:8px 24px 6px;background-color:${BLACK};">
      <div style="font-family:${DISPLAY};font-size:32px;line-height:36px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};">${esc(args.headline)}</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 24px 24px;background-color:${BLACK};">
      <div style="font-family:${BODY};font-size:16px;line-height:24px;color:${MUTED};">${args.standfirst}</div>
    </td>
  </tr>

  <tr>
    <td style="padding:0 24px 24px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${args.accent};">
        <tr><td style="padding:20px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${args.details}</table>
        </td></tr>
      </table>
    </td>
  </tr>

  ${args.body}

  <tr>
    <td style="padding:0 24px 8px;background-color:${BLACK};border-top:1px solid #2B2B30;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding:22px 0 6px;font-family:${BODY};font-size:15px;line-height:24px;color:${CREAM};">
          <a href="tel:5404479432" style="color:${EMBER};text-decoration:none;">${PHONE}</a>
          &nbsp;&middot;&nbsp;
          <a href="mailto:${args.support}" style="color:${EMBER};text-decoration:none;">${esc(args.support)}</a>
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
}

/** One titled panel in the body stack. Lines are already escaped by the caller. */
function panel(heading: string, lines: string[], accent = EMBER): string {
  return `<tr>
    <td style="padding:0 24px 24px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${accent};">
        <tr><td style="padding:20px 22px;">
          <div style="font-family:${BODY};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${accent};padding-bottom:12px;">${esc(heading)}</div>
          ${lines
            .map(
              (line) =>
                `<div style="font-family:${BODY};font-size:15px;line-height:24px;color:${CREAM};padding-bottom:10px;">${line}</div>`
            )
            .join('')}
        </td></tr>
      </table>
    </td>
  </tr>`;
}

/* ------------------------------------------------------ payment received */

/**
 * Sent the moment a payment settles, and for a free organisation spot the
 * moment the form is submitted.
 *
 * The headline is the hardest part of this message. It cannot say confirmed,
 * because it is not, and it must not read as bad news, because nothing has gone
 * wrong. So it states the thing that is plainly true, that we have the
 * application, and lets the panel underneath carry the rule.
 */
export function renderPaymentReceived(
  r: RegistrationEmail,
  /** Public contact address, injected by the caller from SUPPORT_EMAIL. */
  SUPPORT: string
): { subject: string; html: string; text: string } {
  const free = r.payment_status === 'not_required' || r.amount_cents === 0;
  const paidLine = free ? 'No charge, Alice organization' : `${money(r.amount_cents)} received`;

  const details = [
    detailRow('Business', r.business_name),
    detailRow('Spot requested', spotLabel(r.spot_type)),
    detailRow('Event', r.event_name),
    detailRow('Payment', paidLine),
    detailRow('Status', 'Waiting on review', true),
  ].join('');

  const reviewLines = free
    ? [
        `<b style="color:${CREAM};">This is not a confirmed spot yet.</b> We review every application ${esc(REVIEW_WINDOW)} and email you either way.`,
        'If we can fit you in, you get a confirmation with everything you need for the day. Nothing has been charged, so there is nothing to refund if we cannot.',
      ]
    : [
        `<b style="color:${CREAM};">Your payment reserves your place in the review queue. It does not confirm your spot.</b>`,
        `We review every application ${esc(REVIEW_WINDOW)}. If we can fit you in, you get a confirmation email with everything you need for the day.`,
        `<b style="color:${CREAM};">If we cannot accommodate you, you are refunded in full, automatically.</b> You do not have to ask for it, and it takes ${esc(REFUND_WINDOW)} to appear on your statement.`,
      ];

  const body = [
    panel('What happens next', reviewLines, EMBER),
    panel(
      'Nothing to do right now',
      [
        'Hold off on buying stock or booking help for this date until the confirmation email arrives.',
        `Questions before then, call or text ${PHONE}.`,
      ],
      RUST
    ),
  ].join('');

  const html = shell({
    title: 'We have your application',
    preview: `We have your application for ${r.event_name}. We review ${REVIEW_WINDOW} and email you either way.`,
    headline: 'We have your application',
    standfirst: `You are in the queue for ${esc(r.event_name)}. Here is exactly where that leaves you.`,
    accent: EMBER,
    details,
    body,
    support: SUPPORT,
  });

  const text = [
    'WE HAVE YOUR APPLICATION',
    '',
    `You are in the queue for ${r.event_name}. Here is exactly where that leaves you.`,
    '',
    `Business:        ${r.business_name}`,
    `Spot requested:  ${spotLabel(r.spot_type)}`,
    `Event:           ${r.event_name}`,
    `Payment:         ${paidLine}`,
    'Status:          Waiting on review',
    '',
    'WHAT HAPPENS NEXT',
    ...(free
      ? [
          `This is not a confirmed spot yet. We review every application ${REVIEW_WINDOW} and email you either way.`,
          'Nothing has been charged, so there is nothing to refund if we cannot fit you in.',
        ]
      : [
          'Your payment reserves your place in the review queue. It does not confirm your spot.',
          `We review every application ${REVIEW_WINDOW}. If we can fit you in, you get a confirmation email with everything you need for the day.`,
          `If we cannot accommodate you, you are refunded in full, automatically. You do not have to ask for it, and it takes ${REFUND_WINDOW} to appear on your statement.`,
        ]),
    '',
    'NOTHING TO DO RIGHT NOW',
    'Hold off on buying stock or booking help for this date until the confirmation email arrives.',
    `Questions before then, call or text ${PHONE}.`,
    '',
    `${PHONE} · ${SUPPORT}`,
    SITE_URL,
    `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.zip}`,
  ].join('\n');

  return {
    subject: `We have your application for ${r.event_name}, now in review`,
    html,
    text,
  };
}

/* -------------------------------------------------------------- denial */

export type DeniedEmail = RegistrationEmail & {
  /** The admin's own words. Reproduced exactly, never rewritten. */
  reason: string;
  /** What actually went back, in cents. Zero for a free spot. */
  refund_amount_cents: number;
};

/**
 * Sent on a denial.
 *
 * The order is chosen for the person reading it. The refund comes first,
 * because that is the question they will have the instant they read the
 * headline, and making someone scroll past an explanation to find out whether
 * they are getting their money back would be a cruel way to lay out a page.
 *
 * When the automatic refund fails this email still goes out and still promises
 * the money. It is worded so it stays true either way, and the tracker flags the
 * row for the admin to settle by hand. The vendor should not be made to care
 * which path it took.
 */
export function renderVendorDenied(
  r: DeniedEmail,
  SUPPORT: string
): { subject: string; html: string; text: string } {
  const refunded = r.refund_amount_cents > 0;

  const details = [
    detailRow('Business', r.business_name),
    detailRow('Spot requested', spotLabel(r.spot_type)),
    detailRow('Event', r.event_name),
    detailRow(
      'Refund',
      refunded ? `${money(r.refund_amount_cents)}, in full` : 'Nothing was charged',
      true
    ),
  ].join('');

  const refundLines = refunded
    ? [
        `<b style="color:${CREAM};">You are being refunded ${esc(money(r.refund_amount_cents))} in full.</b> That is the whole fee, with nothing held back.`,
        `It goes back to the card you paid with and takes ${esc(REFUND_WINDOW)} to appear on your statement. That timing is set by your bank, not by us.`,
        'You do not need to do anything to claim it.',
      ]
    : ['Nothing was charged for this application, so there is nothing to refund.'];

  const body = [
    panel(refunded ? 'Your refund' : 'Payment', refundLines, EMBER),
    panel('Why', [esc(r.reason)], RUST),
    panel(
      'You are welcome to apply again',
      [
        'This decision is about one date and one lineup. It is not a bar on applying for another event.',
        `If you want to talk it through, call or text ${PHONE}, or reply to this email.`,
      ],
      RUST
    ),
  ].join('');

  const html = shell({
    title: 'About your Coyoteville application',
    preview: refunded
      ? `We could not fit you in for ${r.event_name}. You are refunded in full.`
      : `We could not fit you in for ${r.event_name}.`,
    headline: 'We could not fit you in',
    standfirst: `We reviewed your application for ${esc(r.event_name)} and we are not able to give you a spot this time.`,
    accent: RUST,
    details,
    body,
    support: SUPPORT,
  });

  const text = [
    'WE COULD NOT FIT YOU IN',
    '',
    `We reviewed your application for ${r.event_name} and we are not able to give you a spot this time.`,
    '',
    `Business:        ${r.business_name}`,
    `Spot requested:  ${spotLabel(r.spot_type)}`,
    `Event:           ${r.event_name}`,
    `Refund:          ${refunded ? `${money(r.refund_amount_cents)}, in full` : 'Nothing was charged'}`,
    '',
    refunded ? 'YOUR REFUND' : 'PAYMENT',
    ...(refunded
      ? [
          `You are being refunded ${money(r.refund_amount_cents)} in full. That is the whole fee, with nothing held back.`,
          `It goes back to the card you paid with and takes ${REFUND_WINDOW} to appear on your statement. That timing is set by your bank, not by us.`,
          'You do not need to do anything to claim it.',
        ]
      : ['Nothing was charged for this application, so there is nothing to refund.']),
    '',
    'WHY',
    r.reason,
    '',
    'YOU ARE WELCOME TO APPLY AGAIN',
    'This decision is about one date and one lineup. It is not a bar on applying for another event.',
    `If you want to talk it through, call or text ${PHONE}, or reply to this email.`,
    '',
    `${PHONE} · ${SUPPORT}`,
    SITE_URL,
    `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.zip}`,
  ].join('\n');

  return {
    subject: `About your application for ${r.event_name}`,
    html,
    text,
  };
}
