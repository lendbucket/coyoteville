import { esc, logoHeader, preheader } from './shared';

/**
 * The one time invite to claim a vendor profile.
 *
 * Goes to somebody who has already set up in the lot, so it opens by saying
 * that rather than by selling anything. There is no offer, no deadline and no
 * follow up: this is sent once, and if they ignore it nothing changes for them.
 * Applying anonymously works exactly as it always has.
 *
 * The permit sentence is not filler. A stored permit past its date will ask for
 * a fresh upload at signup, and somebody who claims a profile expecting never
 * to photograph a permit again should hear that here rather than discover it
 * the night before an event.
 *
 * One screen on a phone. No dashes beyond the hyphen and no emoji, enforced by
 * scripts/check-email-copy.js.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PHONE = '540 447 9432';

export function renderVendorInvite(opts: {
  businessName: string;
  /** The login page, with their address already filled in. */
  loginUrl: string;
  supportEmail: string;
}): { subject: string; html: string; text: string } {
  const { businessName, loginUrl, supportEmail } = opts;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Save your details for the next Coyoteville event</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader('Your details are saved. Claim them and skip the uploads next time.')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">

    <p style="margin:0 0 14px;">Hi ${esc(businessName)},</p>

    <p style="margin:0 0 14px;">
      You have set up with us before, so we have saved your details: your
      business information, your logo, your photos and your permit.
    </p>

    <p style="margin:0 0 20px;">
      <a href="${loginUrl}" style="display:inline-block;background-color:#C4552B;color:#FFFFFF;font-family:${BODY};font-size:16px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:4px;">Claim your details</a>
    </p>

    <p style="margin:0 0 16px;">
      One tap and they are yours. Next time you sign up, the form is already
      filled in and your files are already there. All you do is sign the
      agreement, which you sign fresh every time.
    </p>

    <p style="margin:0 0 16px;">
      One thing worth knowing: your DSHS health permit has to be current for the
      date you are booking. If the one we have has run out, we will ask you for
      a new one at signup.
    </p>

    <p style="margin:0 0 18px;color:#555555;font-size:14px;">
      You do not have to do any of this. Signing up without an account works
      exactly as it always has. Questions, call or text ${esc(PHONE)} or email
      <a href="mailto:${esc(supportEmail)}" style="color:#C4552B;">${esc(supportEmail)}</a>.
    </p>

    <p style="margin:0;color:#555555;font-size:14px;">Robert<br />Coyoteville<br />${esc(PHONE)}</p>

  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    `Hi ${businessName},`,
    '',
    'You have set up with us before, so we have saved your details: your business information, your logo, your photos and your permit.',
    '',
    'Claim your details here:',
    loginUrl,
    '',
    'One tap and they are yours. Next time you sign up, the form is already filled in and your files are already there. All you do is sign the agreement, which you sign fresh every time.',
    '',
    'One thing worth knowing: your DSHS health permit has to be current for the date you are booking. If the one we have has run out, we will ask you for a new one at signup.',
    '',
    `You do not have to do any of this. Signing up without an account works exactly as it always has. Questions, call or text ${PHONE} or email ${supportEmail}.`,
    '',
    'Robert',
    'Coyoteville',
    PHONE,
  ].join('\n');

  return {
    subject: 'Save your details for the next Coyoteville event',
    html,
    text,
  };
}
