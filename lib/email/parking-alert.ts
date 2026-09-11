import { esc } from './shared';

/**
 * One payment, the moment it lands.
 *
 * Deliberately plain and deliberately small. This arrives on a phone in a lot,
 * possibly forty times in an evening, and the only thing it has to do is put
 * the amount and the running count on a lock screen without being opened. The
 * report at the end of the night is where the depth goes.
 *
 * Nothing in here may ever be allowed to fail a payment. The caller sends it
 * after the row is written, outside the response path, and swallows anything
 * that goes wrong. See the comment in the webhook.
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

export type ParkingAlert = {
  kind: 'parking' | 'donation';
  amountCents: number;
  /** Already formatted in Central by the caller, which owns the clock. */
  at: string;
  orgName: string | null;
  eventName: string;
  totals: {
    cents: number;
    vehicles: number;
    donationCents: number;
    donations: number;
    owedCents: number;
  };
  trackerUrl: string;
};

export function renderParkingAlert(a: ParkingAlert): {
  subject: string;
  html: string;
  text: string;
} {
  const gift = a.kind === 'donation';

  /* The count in the subject is the count of this kind, so "47 tonight" on a
     parking payment means forty seven cars and not forty seven of anything
     else. That number is the one being watched from the gate. */
  const n = gift ? a.totals.donations : a.totals.vehicles;
  const noun = gift ? (n === 1 ? 'gift' : 'gifts') : n === 1 ? 'vehicle' : 'vehicles';

  const subject = gift
    ? `Gift: ${money(a.amountCents)}${a.orgName ? ` to ${a.orgName}` : ''} (${n} tonight)`
    : `Parking: ${money(a.amountCents)} (${n} tonight)`;

  const rows: [string, string][] = [
    ['Collected', money(a.totals.cents)],
    ['Vehicles', String(a.totals.vehicles)],
    ['Gifts', `${money(a.totals.donationCents)} from ${a.totals.donations}`],
    ['Coming to the org', money(a.totals.owedCents)],
  ];

  const text = [
    `${gift ? 'Gift' : 'Parking'} ${money(a.amountCents)} at ${a.at}.`,
    `${a.eventName}${a.orgName ? `, working for ${a.orgName}` : ''}.`,
    '',
    'Tonight so far',
    ...rows.map(([k, v]) => `  ${k}: ${v}`),
    '',
    a.trackerUrl,
  ].join('\n');

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:16px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  <tr><td style="padding:18px 20px;font-family:${BODY};font-size:15px;line-height:22px;color:#111111;">
    <p style="margin:0 0 2px;font-size:30px;line-height:1.1;font-weight:bold;color:#111111;">${esc(money(a.amountCents))}</p>
    <p style="margin:0 0 14px;color:#666666;font-size:14px;">${gift ? 'Gift' : 'Parking'}, ${esc(a.at)}, ${esc(String(n))} ${esc(noun)} tonight</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BODY};font-size:14px;">
${rows
  .map(
    ([k, v]) =>
      `      <tr><td style="padding:5px 0;color:#555555;border-top:1px solid #EEEEEE;">${esc(k)}</td><td align="right" style="padding:5px 0;font-weight:bold;color:#111111;border-top:1px solid #EEEEEE;">${esc(v)}</td></tr>`
  )
  .join('\n')}
    </table>
    <p style="margin:16px 0 0;font-size:14px;"><a href="${esc(a.trackerUrl)}" style="color:#C4552B;">Open the tracker</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
