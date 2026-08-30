import type { RegistrationEmail } from '../notify-types';
import { ADDRESS, SITE_URL } from '../seo';
import { formatDayLong, isDayKey } from '../booking';
import { LOGO_ALT, LOGO_URL, esc, preheader } from './shared';

/**
 * The two recurring billing emails a permanent vendor gets.
 *
 * A renewal receipt, because a monthly charge that arrives with no email behind
 * it is the single most common way a subscription turns into a chargeback. And
 * a failed payment notice, which has one job: get the card fixed before Square
 * stops retrying.
 *
 * Same email client rules as the rest of lib/email. Nested tables, everything
 * inlined, 600px, no SVG, a plain text part alongside.
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

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function day(value: string | null): string {
  return value && isDayKey(value) ? formatDayLong(value) : 'the end of the current period';
}

function row(label: string, value: string, last = false): string {
  const border = last ? '' : 'border-bottom:1px solid #2B2B30;';
  return `<tr>
    <td style="${border}padding:10px 0;font-family:${BODY};font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="${border}padding:10px 0 10px 16px;font-family:${BODY};font-size:15px;font-weight:bold;color:${CREAM};vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

function shell(args: {
  title: string;
  preview: string;
  headline: string;
  standfirst: string;
  accent: string;
  details: string;
  panels: string;
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

  <tr><td align="center" style="padding:32px 24px 18px;">
    <img src="${LOGO_URL}" width="230" alt="${LOGO_ALT}" style="display:block;width:230px;max-width:230px;height:auto;border:0;outline:none;text-decoration:none;" />
  </td></tr>

  <tr><td align="center" style="padding:8px 24px 6px;">
    <div style="font-family:${DISPLAY};font-size:30px;line-height:34px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};">${esc(args.headline)}</div>
  </td></tr>
  <tr><td align="center" style="padding:0 24px 24px;">
    <div style="font-family:${BODY};font-size:16px;line-height:24px;color:${MUTED};">${args.standfirst}</div>
  </td></tr>

  <tr><td style="padding:0 24px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${args.accent};">
      <tr><td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${args.details}</table>
      </td></tr>
    </table>
  </td></tr>

  ${args.panels}

  <tr><td style="padding:0 24px 8px;border-top:1px solid #2B2B30;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding:22px 0 6px;font-family:${BODY};font-size:15px;line-height:24px;color:${CREAM};">
        <a href="tel:5404479432" style="color:${EMBER};text-decoration:none;">${PHONE}</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:${args.support}" style="color:${EMBER};text-decoration:none;">${esc(args.support)}</a>
      </td></tr>
      <tr><td align="center" style="padding:0 0 30px;font-family:${BODY};font-size:12px;line-height:18px;color:#7C766C;">
        ${esc(ADDRESS.street)}, ${esc(ADDRESS.city)}, ${esc(ADDRESS.state)} ${esc(ADDRESS.zip)}
        &nbsp;&middot;&nbsp;<a href="${SITE_URL}" style="color:#7C766C;">coyoteville.com</a>
      </td></tr>
    </table>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

function panel(heading: string, lines: string[], accent = EMBER): string {
  return `<tr><td style="padding:0 24px 24px;">
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
  </td></tr>`;
}

/* -------------------------------------------------------------- renewal */

export type RenewalEmail = RegistrationEmail & {
  /** Paid through, which is also when the next charge lands. */
  next_charge_date: string | null;
  /** True when this is the last charge because a cancellation is booked. */
  canceling: boolean;
};

export function renderSubscriptionRenewed(
  r: RenewalEmail,
  SUPPORT: string
): { subject: string; html: string; text: string } {
  const amount = money(r.amount_cents);
  const through = day(r.next_charge_date);

  const details = [
    row('Business', r.business_name),
    row('Charged', amount),
    row('Spot', r.spot_type === 'truck' ? 'Permanent food truck spot' : 'Permanent booth'),
    row(r.canceling ? 'Runs until' : 'Next charge', through, true),
  ].join('');

  const panels = r.canceling
    ? panel(
        'This was your last charge',
        [
          `Your spot is cancelled and runs until <b style="color:${CREAM};">${esc(through)}</b>. You keep it for every day up to then and you will not be charged again.`,
          'If you want to keep going after that, tell us before the date and we will start it back up.',
        ],
        RUST
      )
    : panel(
        'Nothing to do',
        [
          `Your spot rolls on. The next charge of <b style="color:${CREAM};">${esc(amount)}</b> is on ${esc(through)}, to the same card.`,
          'To cancel, email or call us. Cancelling stops the next charge and you keep the spot to the end of the month you have paid for.',
        ],
        EMBER
      );

  const html = shell({
    title: 'Your monthly spot has renewed',
    preview: `${amount} for your permanent spot at Coyoteville. Next charge ${through}.`,
    headline: r.canceling ? 'Your final charge' : 'Your spot has renewed',
    standfirst: `We have taken ${esc(amount)} for your permanent spot at Coyoteville.`,
    accent: EMBER,
    details,
    panels,
    support: SUPPORT,
  });

  const text = [
    r.canceling ? 'YOUR FINAL CHARGE' : 'YOUR SPOT HAS RENEWED',
    '',
    `We have taken ${amount} for your permanent spot at Coyoteville.`,
    '',
    `Business:  ${r.business_name}`,
    `Charged:   ${amount}`,
    `Spot:      ${r.spot_type === 'truck' ? 'Permanent food truck spot' : 'Permanent booth'}`,
    `${r.canceling ? 'Runs until' : 'Next charge'}: ${through}`,
    '',
    ...(r.canceling
      ? [
          `This was your last charge. Your spot runs until ${through} and you will not be charged again.`,
          'If you want to keep going after that, tell us before the date and we will start it back up.',
        ]
      : [
          `Your spot rolls on. The next charge of ${amount} is on ${through}, to the same card.`,
          'To cancel, email or call us. Cancelling stops the next charge and you keep the spot to the end of the month you have paid for.',
        ]),
    '',
    `${PHONE} · ${SUPPORT}`,
    SITE_URL,
  ].join('\n');

  return {
    subject: r.canceling
      ? `Your final Coyoteville charge, ${amount}`
      : `Your Coyoteville spot has renewed, ${amount}`,
    html,
    text,
  };
}

/* -------------------------------------------------------------- failure */

export type PaymentFailedEmail = RegistrationEmail & {
  /** Which consecutive failure this is. */
  attempt: number;
  /** When Square will try again, if it said. */
  retry_date: string | null;
  /** What they are paid up to. They keep the spot until then. */
  paid_through: string | null;
};

export function renderSubscriptionPaymentFailed(
  r: PaymentFailedEmail,
  SUPPORT: string
): { subject: string; html: string; text: string } {
  const amount = money(r.amount_cents);
  const retry = r.retry_date && isDayKey(r.retry_date) ? formatDayLong(r.retry_date) : null;

  const details = [
    row('Business', r.business_name),
    row('Amount due', amount),
    row('Attempt', String(r.attempt)),
    row('Spot held until', day(r.paid_through), true),
  ].join('');

  const panels = [
    panel(
      'What to do',
      [
        `<b style="color:${CREAM};">Your card did not go through for this month.</b> It is usually an expiry date or a new card number.`,
        `Call or text <b style="color:${CREAM};">${PHONE}</b> and we will take the new card over the phone. It takes a minute.`,
        retry
          ? `We will try the card on file again on ${esc(retry)}. If it works before then, nothing else needs to happen.`
          : 'We will try the card on file again over the next few days. If it works, nothing else needs to happen.',
      ],
      RUST
    ),
    panel(
      'You have not lost your spot',
      [
        `You keep your space up to ${esc(day(r.paid_through))}, which is what you have paid for.`,
        'We are not going to give it to somebody else over a card that expired. Get the card sorted and it carries straight on.',
      ],
      EMBER
    ),
  ].join('');

  const html = shell({
    title: 'Your monthly payment did not go through',
    preview: `${amount} did not go through for your permanent spot. Call ${PHONE} and we will fix the card.`,
    headline: 'Your payment did not go through',
    standfirst: `We could not take ${esc(amount)} for your permanent spot this month.`,
    accent: RUST,
    details,
    panels,
    support: SUPPORT,
  });

  const text = [
    'YOUR PAYMENT DID NOT GO THROUGH',
    '',
    `We could not take ${amount} for your permanent spot this month.`,
    '',
    `Business:        ${r.business_name}`,
    `Amount due:      ${amount}`,
    `Attempt:         ${r.attempt}`,
    `Spot held until: ${day(r.paid_through)}`,
    '',
    'WHAT TO DO',
    'Your card did not go through for this month. It is usually an expiry date or a new card number.',
    `Call or text ${PHONE} and we will take the new card over the phone. It takes a minute.`,
    retry
      ? `We will try the card on file again on ${retry}. If it works before then, nothing else needs to happen.`
      : 'We will try the card on file again over the next few days. If it works, nothing else needs to happen.',
    '',
    'YOU HAVE NOT LOST YOUR SPOT',
    `You keep your space up to ${day(r.paid_through)}, which is what you have paid for.`,
    'We are not going to give it to somebody else over a card that expired.',
    '',
    `${PHONE} · ${SUPPORT}`,
    SITE_URL,
  ].join('\n');

  return {
    subject: `Action needed: your Coyoteville payment of ${amount} did not go through`,
    html,
    text,
  };
}
