import { NEXT_EVENT, PRICING } from '../seo';

/**
 * Payment reminder.
 *
 * Short and plain. The line that has to land is that the spot is not held until
 * the payment goes through, because that is the part people assume.
 *
 * The link handed in here is always the vendor's original Square payment link.
 * A new order would carry a different referenceId and the webhook would settle
 * it against the wrong application.
 */
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PHONE = '540 447 9432';

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function spotLabel(spot: string): string {
  if (spot === 'truck') return PRICING.truck.label;
  if (spot === 'booth') return PRICING.booth.label;
  return PRICING.free.label;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function renderReminder(opts: {
  businessName: string;
  spotType: string;
  amountCents: number;
  finishUrl: string;
  supportEmail: string;
}): { subject: string; html: string; text: string } {
  const { businessName, spotType, amountCents, finishUrl, supportEmail } = opts;

  const spot = spotLabel(spotType);
  const amount = money(amountCents);

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Finish your Coyoteville payment</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">

    <p style="margin:0 0 14px;">
      We got your application and your signed agreement for Coyoteville on
      ${esc(NEXT_EVENT.displayDate)}.
    </p>

    <p style="margin:0 0 16px;">
      <strong>Your spot is not held until the payment goes through.</strong>
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr>
        <td style="padding:4px 14px 4px 0;color:#666666;font-family:${BODY};font-size:14px;">Spot</td>
        <td style="padding:4px 0;font-family:${BODY};font-size:14px;"><strong>${esc(spot)}</strong></td>
      </tr>
      <tr>
        <td style="padding:4px 14px 4px 0;color:#666666;font-family:${BODY};font-size:14px;">Amount due</td>
        <td style="padding:4px 0;font-family:${BODY};font-size:14px;"><strong>${esc(amount)}</strong></td>
      </tr>
    </table>

    <p style="margin:0 0 20px;">
      <a href="${finishUrl}" style="display:inline-block;background-color:#C4552B;color:#FFFFFF;font-family:${BODY};font-size:15px;font-weight:bold;text-decoration:none;padding:13px 24px;border-radius:4px;">Finish your payment</a>
    </p>

    <p style="margin:0 0 16px;">
      Setup opens at 8:00 AM Friday morning and gates open to the public at 4:00 PM.
    </p>

    <p style="margin:0 0 18px;color:#555555;font-size:14px;">
      Questions, call or text ${esc(PHONE)} or email
      <a href="mailto:${esc(supportEmail)}" style="color:#C4552B;">${esc(supportEmail)}</a>.
    </p>

    <p style="margin:0;color:#555555;font-size:14px;">Coyoteville<br />${esc(PHONE)}</p>

  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    `We got your application and your signed agreement for Coyoteville on ${NEXT_EVENT.displayDate}.`,
    '',
    'Your spot is not held until the payment goes through.',
    '',
    `Spot:       ${spot}`,
    `Amount due: ${amount}`,
    '',
    'Finish your payment here:',
    finishUrl,
    '',
    'Setup opens at 8:00 AM Friday morning and gates open to the public at 4:00 PM.',
    '',
    `Questions, call or text ${PHONE} or email ${supportEmail}.`,
    '',
    'Coyoteville',
    PHONE,
  ].join('\n');

  return {
    subject: `Finish your payment for ${businessName}, ${NEXT_EVENT.name}`,
    html,
    text,
  };
}
