import { esc, logoHeader, preheader } from './shared';

/**
 * The sign in link for a vendor profile.
 *
 * Magic link only. There is no password to set, forget or reset, because these
 * are people on a phone in a parking lot and a password is one more thing to
 * lose. The link is the whole authentication.
 *
 * Two audiences, one template. Somebody signing in again gets a plain link;
 * somebody who has just been offered a profile after applying gets a sentence
 * saying what the profile is for. The difference is one paragraph.
 *
 * No dashes beyond the hyphen and no emoji, enforced by
 * scripts/check-email-copy.js.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PHONE = '540 447 9432';

export function renderMagicLink(opts: {
  url: string;
  /** True the first time, when the profile is being offered rather than reopened. */
  firstTime: boolean;
  minutes: number;
  supportEmail: string;
}): { subject: string; html: string; text: string } {
  const { url, firstTime, minutes, supportEmail } = opts;

  const lead = firstTime
    ? 'Here is your link to save your vendor details. Once they are saved, applying for the next event is a form that is already filled in and files you do not have to photograph again.'
    : 'Here is your link to open your vendor details.';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Coyoteville sign in link</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader(`Your sign in link. It works for ${minutes} minutes.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">

    <p style="margin:0 0 14px;">${esc(lead)}</p>

    <p style="margin:0 0 20px;">
      <a href="${url}" style="display:inline-block;background-color:#C4552B;color:#FFFFFF;font-family:${BODY};font-size:16px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:4px;">Open my vendor details</a>
    </p>

    <p style="margin:0 0 16px;">
      The link works for ${minutes} minutes and can be used once. If it has run
      out, ask for a new one and we will send another.
    </p>

    <p style="margin:0 0 16px;">
      Your saved details do not include your signature. You sign the vendor
      agreement fresh every time you apply, which is how it has to work.
    </p>

    <p style="margin:0 0 18px;color:#555555;font-size:14px;">
      If you did not ask for this, you can ignore it and nothing happens.
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
    lead,
    '',
    'Open your vendor details here:',
    url,
    '',
    `The link works for ${minutes} minutes and can be used once. If it has run out, ask for a new one and we will send another.`,
    '',
    'Your saved details do not include your signature. You sign the vendor agreement fresh every time you apply, which is how it has to work.',
    '',
    `If you did not ask for this, you can ignore it and nothing happens. Questions, call or text ${PHONE} or email ${supportEmail}.`,
    '',
    'Coyoteville',
    PHONE,
  ].join('\n');

  return { subject: 'Your Coyoteville sign in link', html, text };
}
