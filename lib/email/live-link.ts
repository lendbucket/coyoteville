import { esc, logoHeader, preheader } from './shared';

/**
 * The link to an organization's live parking page.
 *
 * Sent by hand from the tracker on the day, alongside a text carrying the same
 * URL. The text is the one that gets opened in a stand on a Friday night; this
 * is the one that is still findable on Sunday when somebody asks what the total
 * was.
 *
 * Deliberately short. It has one job, which is to carry a link that works, and
 * every extra paragraph is a reason for it to be skimmed past on a phone.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PHONE = '540 447 9432';

function shell(title: string, inner: string, preview: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader(preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:24px;color:#111111;">
${inner}
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

export function renderLiveLink(opts: {
  programName: string;
  orgName: string;
  contactName: string;
  url: string;
}): { subject: string; html: string; text: string } {
  const { programName, orgName, contactName, url } = opts;
  const first = contactName.trim().split(/\s+/)[0] || contactName.trim();

  const lines = [
    `Hi ${first},`,
    '',
    `Here is your ${programName} page for ${orgName}. It shows what parking has taken tonight, your half of it, and every payment as it lands.`,
    '',
    url,
    '',
    'It updates on its own while the page is open, so you can leave it up and show it to people. Share it with your volunteers and your families if you want to.',
    '',
    'The page keeps working after the event and shows the final numbers, and it says the date you were paid once the payment goes out.',
    '',
    `Questions tonight, call or text ${PHONE}.`,
    '',
    'Robert',
    'Coyoteville',
    PHONE,
  ];

  const inner = `
    <p style="margin:0 0 14px;">Hi ${esc(first)},</p>
    <p style="margin:0 0 14px;">Here is your ${esc(programName)} page for <strong>${esc(orgName)}</strong>. It shows what parking has taken tonight, your half of it, and every payment as it lands.</p>
    <p style="margin:0 0 18px;"><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;background-color:#C4552B;color:#FFFFFF;text-decoration:none;font-weight:bold;">Open your live page</a></p>
    <p style="margin:0 0 14px;color:#555555;font-size:14px;">It updates on its own while the page is open, so you can leave it up and show it to people. Share it with your volunteers and your families if you want to.</p>
    <p style="margin:0 0 14px;color:#555555;font-size:14px;">The page keeps working after the event and shows the final numbers, and it says the date you were paid once the payment goes out.</p>
    <p style="margin:0 0 18px;color:#555555;font-size:13px;word-break:break-all;">If the button does not work, this is the link: ${esc(url)}</p>
    <p style="margin:0;color:#555555;font-size:14px;">Robert<br />Coyoteville<br />${esc(PHONE)}</p>`;

  return {
    subject: `Your ${programName} page for tonight`,
    html: shell(`Your ${programName} page`, inner, `What parking has taken for ${orgName} tonight.`),
    text: lines.join('\n'),
  };
}
