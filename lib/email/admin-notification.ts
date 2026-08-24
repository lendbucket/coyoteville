import type { RegistrationEmail } from '../notify-types';
import { SITE_URL } from '../seo';

/**
 * Owner notification.
 *
 * A working document, not a marketing piece. No hero, no logo, no theme: a
 * scannable table of what was submitted, how they paid, whether a permit came
 * with it, and a link straight into the tracker filtered to this vendor.
 *
 * Light background on purpose. This gets read in a busy inbox on a phone, often
 * next to other plain mail, and it should look like the rest of it.
 */
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spotLabel(spot: string): string {
  if (spot === 'truck') return 'Food Truck';
  if (spot === 'booth') return 'Booth';
  return 'Alice Organization';
}

function money(cents: number): string {
  return cents === 0 ? 'No charge' : `$${(cents / 100).toFixed(2)}`;
}

function when(iso: string | null): string {
  if (!iso) return 'not recorded';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function renderAdminNotification(r: RegistrationEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const path =
    r.payment_method === 'offline'
      ? 'Prepaid link, paid outside the website'
      : r.payment_status === 'not_required'
        ? 'Website, Alice organization, no charge'
        : 'Website, paid through Square';

  const permit = r.permit_uploaded
    ? 'Uploaded'
    : r.spot_type === 'truck' || r.serves_food
      ? 'MISSING, and required for this vendor'
      : 'Not required';

  const rows: Array<[string, string, boolean?]> = [
    ['Business', r.business_name],
    ['Contact', r.contact_name],
    ['Phone', r.phone],
    ['Email', r.email],
    ['Spot type', spotLabel(r.spot_type)],
    ['Event', r.event_name],
    ['Sells', r.sells],
    ['Serves food', r.serves_food ? 'Yes' : 'No'],
    ['Notes', r.notes || 'None'],
    ['How they registered', path],
    ['Payment', `${r.payment_status} · ${money(r.amount_cents)}`],
    ['Food handler permit', permit, !r.permit_uploaded && (r.spot_type === 'truck' || r.serves_food)],
    ['Signed by', r.signature_name],
    ['Signed at', when(r.signed_at)],
    ['Agreement version', r.agreement_version || 'not recorded'],
    ['Application id', r.id],
  ];

  const adminUrl = `${SITE_URL}/admin?event=${encodeURIComponent(r.event_slug)}&q=${encodeURIComponent(r.business_name)}`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>New vendor registration</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  <tr><td style="padding:20px 22px 6px;">
    <div style="font-family:${BODY};font-size:19px;font-weight:bold;color:#111111;">${esc(r.business_name)}</div>
    <div style="font-family:${BODY};font-size:14px;color:#666666;padding-top:3px;">
      ${esc(spotLabel(r.spot_type))} &middot; ${esc(r.event_name)}
    </div>
  </td></tr>

  <tr><td style="padding:12px 22px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows
        .map(
          ([k, v, warn]) => `<tr>
        <td width="38%" style="padding:7px 12px 7px 0;border-bottom:1px solid #EEEEF0;font-family:${BODY};font-size:13px;color:#666666;vertical-align:top;">${esc(k)}</td>
        <td style="padding:7px 0;border-bottom:1px solid #EEEEF0;font-family:${k === 'Application id' ? MONO : BODY};font-size:${k === 'Application id' ? '12px' : '14px'};color:${warn ? '#B3261E' : '#111111'};font-weight:${warn ? 'bold' : 'normal'};vertical-align:top;word-break:break-word;">${esc(v)}</td>
      </tr>`
        )
        .join('')}
    </table>
  </td></tr>

  <tr><td style="padding:18px 22px 24px;">
    <a href="${adminUrl}" style="display:inline-block;background-color:#C4552B;color:#FFFFFF;font-family:${BODY};font-size:14px;font-weight:bold;text-decoration:none;padding:11px 20px;border-radius:4px;">Open in the tracker</a>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`;

  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nOpen in the tracker: ${adminUrl}\n`;

  return {
    subject: `New vendor, ${r.business_name}, ${spotLabel(r.spot_type)}, ${r.event_name}`,
    html,
    text,
  };
}
