import { esc } from './shared';

/**
 * A registration landed, or its money did.
 *
 * Same two stages as the vendor alert and for the same reason: an unpaid
 * registration is somebody part way through checkout, a paid one is a place in
 * a field of four hundred that is now gone.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function money(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return `$${(safe / 100).toFixed(2)}`;
}

export type RaceAlert = {
  stage: 'created' | 'paid';
  raceName: string;
  /** "Just me", "Family of 4", "Team, 12 runners". */
  what: string;
  leadName: string;
  email: string;
  phone: string;
  runners: { name: string; age: number | null; shirt: string | null; minor: boolean }[];
  amountCents: number;
  paymentStatus: string;
  /** Where the field stands after this one. */
  taken: number;
  capacity: number;
  trackerUrl: string;
};

export function renderRaceAlert(a: RaceAlert): {
  subject: string;
  html: string;
  text: string;
} {
  const n = a.runners.length;
  const subject =
    a.stage === 'paid'
      ? `Paid: ${a.leadName}, ${a.what}, ${money(a.amountCents)}`
      : `New registration: ${a.leadName}, ${a.what}`;

  const minors = a.runners.filter((r) => r.minor).length;

  const rows: [string, string][] = [
    ['Race', a.raceName],
    ['Entry', a.what],
    ['Lead runner', a.leadName],
    ['Email', a.email],
    ['Phone', a.phone],
    ['Runners', String(n)],
    ['Under 18', minors ? `${minors}, guardian signature on file` : 'None'],
    ['Amount', a.amountCents === 0 ? 'No charge' : `${money(a.amountCents)}, ${a.paymentStatus}`],
    ['Field', a.capacity > 0 ? `${a.taken} of ${a.capacity}` : `${a.taken} registered`],
  ];

  const roster = a.runners.map(
    (r) =>
      `${r.name}${r.age === null ? '' : `, ${r.age}`}${r.shirt ? `, shirt ${r.shirt}` : ''}${r.minor ? ', minor' : ''}`
  );

  const text = [
    a.stage === 'paid' ? 'Paid. The place is theirs.' : 'Registered. Nothing is held until it is paid.',
    '',
    ...rows.map(([k, v]) => `  ${k}: ${v}`),
    '',
    'RUNNERS',
    ...roster.map((r) => `  ${r}`),
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  <tr><td style="padding:20px 22px;font-family:${BODY};font-size:15px;line-height:23px;color:#111111;">
    <p style="margin:0 0 4px;font-size:22px;line-height:1.2;font-weight:bold;">${esc(a.leadName)}</p>
    <p style="margin:0 0 16px;color:#444448;">${esc(
      a.stage === 'paid' ? 'Paid. The place is theirs.' : 'Registered. Nothing is held until it is paid.'
    )}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BODY};font-size:14px;">
${rows
  .map(
    ([k, v]) =>
      `      <tr><td width="110" valign="top" style="padding:6px 0;border-top:1px solid #EEEEEE;color:#555555;">${esc(k)}</td>` +
      `<td valign="top" style="padding:6px 0;border-top:1px solid #EEEEEE;color:#111111;">${esc(v)}</td></tr>`
  )
  .join('\n')}
    </table>
    <p style="margin:16px 0 6px;font-weight:bold;">Runners</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">
${roster.map((r) => `      <li style="margin:0 0 3px;">${esc(r)}</li>`).join('\n')}
    </ul>
    <p style="margin:0;font-size:14px;"><a href="${esc(a.trackerUrl)}" style="color:#C4552B;">Open in the tracker</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
