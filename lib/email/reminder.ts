import { NEXT_EVENT } from '../seo';

/**
 * Checkout reminder.
 *
 * Short and plain. The one thing it has to land is that the spot is not held
 * until the payment goes through, because that is the part people assume.
 */
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderReminder(opts: {
  businessName: string;
  finishUrl: string;
  supportEmail: string;
  phone: string;
}): { subject: string; html: string; text: string } {
  const { businessName, finishUrl, supportEmail, phone } = opts;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Finish your Coyoteville signup</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">
    <p style="margin:0 0 14px;">We saw you started signing up ${esc(businessName)} for ${esc(NEXT_EVENT.name)} on ${esc(NEXT_EVENT.displayDate)}.</p>
    <p style="margin:0 0 14px;"><strong>Your spot is not held until the payment goes through.</strong> Spots are first come, first paid.</p>
    <p style="margin:0 0 22px;">Here is the link to finish:</p>
    <p style="margin:0 0 22px;">
      <a href="${finishUrl}" style="display:inline-block;background-color:#C4552B;color:#FFFFFF;font-family:${BODY};font-size:15px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:4px;">Finish signing up</a>
    </p>
    <p style="margin:0;color:#555555;font-size:14px;">
      If you have changed your mind that is fine, no need to reply. Questions, call ${esc(phone)} or email
      <a href="mailto:${esc(supportEmail)}" style="color:#C4552B;">${esc(supportEmail)}</a>.
    </p>
    <p style="margin:18px 0 0;color:#555555;font-size:14px;">Coyoteville<br />${esc(phone)}</p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    `We saw you started signing up ${businessName} for ${NEXT_EVENT.name} on ${NEXT_EVENT.displayDate}.`,
    '',
    'Your spot is not held until the payment goes through. Spots are first come, first paid.',
    '',
    'Here is the link to finish:',
    finishUrl,
    '',
    `If you have changed your mind that is fine, no need to reply. Questions, call ${phone} or email ${supportEmail}.`,
    '',
    'Coyoteville',
    phone,
  ].join('\n');

  return { subject: `Finish signing up ${businessName} for ${NEXT_EVENT.name}`, html, text };
}
