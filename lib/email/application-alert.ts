import { esc } from './shared';

/**
 * A vendor applied, or a vendor's money landed.
 *
 * Two states, one template, because they are the same facts with a different
 * thing to do about them. An unpaid application is somebody part way through
 * checkout and is not yet holding anything you should act on. A paid one is a
 * spot held, a card charged, and a review that has to happen before the night.
 *
 * The subject carries the decision. It is read on a phone, and the business,
 * the spot type and the night are the three things that decide whether it can
 * wait until the morning.
 *
 * 361 Sweets and Treats sat pending for two days because nothing arrived that
 * said so, which is the failure this exists to stop.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function money(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.abs(Math.round(cents)) : 0;
  return `$${(safe / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type ApplicationAlert = {
  stage: 'created' | 'paid';
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  /** "Food Truck Spot", "Vendor Booth", "Alice Organization". */
  spotLabel: string;
  /** The night, the day, or the permanent spot. Whatever they booked. */
  eventName: string;
  sells: string;
  notes: string | null;
  servesFood: boolean;
  permitUploaded: boolean;
  /** YYYY-MM-DD off the form, or null when none was given. */
  permitExpiresAt: string | null;
  amountCents: number;
  paymentStatus: string;
  trackerUrl: string;
};

/** What the person reading this actually has to do. */
function headline(a: ApplicationAlert): string {
  if (a.stage === 'paid') {
    return a.amountCents === 0
      ? 'Confirmed at no charge. Waiting on your review.'
      : 'Paid. The spot is held but not confirmed until you approve it.';
  }
  return a.amountCents === 0
    ? 'Applied. No payment needed, so this is waiting on your review.'
    : 'Applied and sent to checkout. Nothing is held until the money lands.';
}

/**
 * The permit line, which is the one that stops a truck at the gate.
 *
 * An expiry that has already passed is called out rather than printed flat: a
 * date in a list reads as satisfied, and this one is not.
 */
function permitLine(a: ApplicationAlert, today: string): string {
  if (!a.servesFood && a.spotLabel !== 'Food Truck Spot') return 'Not required for this spot.';
  if (!a.permitUploaded) return 'NOT UPLOADED. Food cannot be served without one.';
  if (!a.permitExpiresAt) return 'Uploaded, with no expiry date given.';
  if (a.permitExpiresAt < today) return `Uploaded, but EXPIRED on ${a.permitExpiresAt}.`;
  return `Uploaded, expires ${a.permitExpiresAt}.`;
}

export function renderApplicationAlert(
  a: ApplicationAlert,
  today: string = new Date().toISOString().slice(0, 10)
): { subject: string; html: string; text: string } {
  const subject =
    a.stage === 'paid'
      ? `Paid: ${a.businessName}, ${a.spotLabel}, ${a.eventName}`
      : `New application: ${a.businessName}, ${a.spotLabel}, ${a.eventName}`;

  const rows: [string, string][] = [
    ['Business', a.businessName],
    ['Contact', a.contactName],
    ['Phone', a.phone],
    ['Email', a.email],
    ['Spot', a.spotLabel],
    ['Event', a.eventName],
    ['Sells', a.sells],
    ['Serves food', a.servesFood ? 'Yes' : 'No'],
    ['Health permit', permitLine(a, today)],
    [
      'Amount',
      a.amountCents === 0 ? 'No charge' : `${money(a.amountCents)}, ${a.paymentStatus}`,
    ],
  ];

  if (a.notes) rows.push(['Notes', a.notes]);

  const text = [
    headline(a),
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Open in the tracker: ${a.trackerUrl}`,
  ].join('\n');

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:16px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  <tr><td style="padding:20px 22px;font-family:${BODY};font-size:15px;line-height:23px;color:#111111;">
    <p style="margin:0 0 4px;font-size:22px;line-height:1.2;font-weight:bold;color:#111111;">${esc(a.businessName)}</p>
    <p style="margin:0 0 16px;color:#444448;">${esc(headline(a))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BODY};font-size:14px;">
${rows
  .map(
    ([k, v]) =>
      `      <tr><td width="130" valign="top" style="padding:6px 0;border-top:1px solid #EEEEEE;color:#555555;">${esc(k)}</td>` +
      `<td valign="top" style="padding:6px 0;border-top:1px solid #EEEEEE;color:#111111;">${esc(v)}</td></tr>`
  )
  .join('\n')}
    </table>
    <p style="margin:18px 0 0;font-size:14px;"><a href="${esc(a.trackerUrl)}" style="color:#C4552B;">Open in the tracker</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
