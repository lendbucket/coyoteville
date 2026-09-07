import { esc, logoHeader, preheader } from './shared';

/**
 * The two emails an organization's application produces.
 *
 * One to the organization confirming what they signed up for, and one to Robert
 * so an application is never something he finds out about by opening the
 * tracker. Same branded family as everything else, and both pass
 * check-email-copy: no dashes beyond the hyphen, no emoji.
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

export function renderOrgConfirmation(opts: {
  programName: string;
  orgName: string;
  contactName: string;
  volunteerMinimum: number;
  payoutWindowDays: number;
  games: string[];
  supportEmail: string;
}): { subject: string; html: string; text: string } {
  const { programName, orgName, contactName, volunteerMinimum, payoutWindowDays, games, supportEmail } = opts;
  const first = contactName.trim().split(/\s+/)[0] || contactName.trim();

  const lines = [
    `Hi ${first},`,
    '',
    `We have your ${programName} application for ${orgName}. Nothing else is needed from you right now.`,
    '',
    'Games you told us you can work:',
    ...games.map((g) => `  ${g}`),
    '',
    `One organization works each game, drawn at random from the applications for it. We will email you either way once a game is drawn, and we will not put your organization in for a night you did not pick.`,
    '',
    'What happens if you are picked:',
    `  You bring at least ${volunteerMinimum} adults for the whole shift.`,
    '  Your people run parking, keep the lot clean, and help keep the crowd in order.',
    '  Every volunteer signs a waiver on the night, before they start.',
    `  You receive 50 percent of the gross parking for that game, paid within ${payoutWindowDays} days.`,
    '',
    'Gross means every vehicle counted at the gate at $10, before any expense.',
    '',
    `Questions, call or text ${PHONE} or email ${supportEmail}.`,
    '',
    'Robert',
    'Coyoteville',
    PHONE,
  ];

  const inner = `
    <p style="margin:0 0 14px;">Hi ${esc(first)},</p>
    <p style="margin:0 0 14px;">We have your ${esc(programName)} application for <strong>${esc(orgName)}</strong>. Nothing else is needed from you right now.</p>
    <p style="margin:0 0 6px;color:#666666;font-size:14px;">Games you told us you can work</p>
    <ul style="margin:0 0 16px;padding-left:18px;">${games.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
    <p style="margin:0 0 14px;">One organization works each game, drawn at random from the applications for it. We will email you either way once a game is drawn, and we will not put your organization in for a night you did not pick.</p>
    <p style="margin:0 0 6px;color:#666666;font-size:14px;">If you are picked</p>
    <ul style="margin:0 0 16px;padding-left:18px;">
      <li>You bring at least ${volunteerMinimum} adults for the whole shift.</li>
      <li>Your people run parking, keep the lot clean, and help keep the crowd in order.</li>
      <li>Every volunteer signs a waiver on the night, before they start.</li>
      <li>You receive 50 percent of the gross parking for that game, paid within ${payoutWindowDays} days.</li>
    </ul>
    <p style="margin:0 0 18px;color:#555555;font-size:14px;">Gross means every vehicle counted at the gate at $10, before any expense. Questions, call or text ${esc(PHONE)} or email <a href="mailto:${esc(supportEmail)}" style="color:#C4552B;">${esc(supportEmail)}</a>.</p>
    <p style="margin:0;color:#555555;font-size:14px;">Robert<br />Coyoteville<br />${esc(PHONE)}</p>`;

  return {
    subject: `We have your ${programName} application for ${orgName}`,
    html: shell(`Your ${programName} application`, inner, `We have your application for ${orgName}.`),
    text: lines.join('\n'),
  };
}

export function renderOrgNotification(opts: {
  programName: string;
  orgName: string;
  orgType: string;
  contactName: string;
  email: string;
  phone: string;
  volunteerCount: number;
  is501c3: boolean;
  ein: string;
  story: string;
  games: string[];
}): { subject: string; html: string; text: string } {
  const o = opts;
  const rows: [string, string][] = [
    ['Organization', o.orgName],
    ['Type', o.orgType],
    ['Contact', o.contactName],
    ['Email', o.email],
    ['Phone', o.phone],
    ['Volunteers offered', String(o.volunteerCount)],
    ['501(c)(3)', o.is501c3 ? 'Yes' : 'Not stated'],
    ['EIN', o.ein || 'Not given'],
    ['Games', o.games.join(', ') || 'None picked'],
  ];

  const inner = `
    <p style="margin:0 0 14px;"><strong>${esc(o.orgName)}</strong> applied to the ${esc(o.programName)}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
      ${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#666666;font-family:${BODY};font-size:14px;">${esc(k)}</td><td style="padding:4px 0;font-family:${BODY};font-size:14px;">${esc(v)}</td></tr>`).join('')}
    </table>
    <p style="margin:0 0 6px;color:#666666;font-size:14px;">What the money would do</p>
    <p style="margin:0 0 16px;">${esc(o.story)}</p>
    <p style="margin:0;color:#555555;font-size:14px;">They are in the draw for the games listed above. Nothing is decided until you pick.</p>`;

  return {
    subject: `${o.programName}: ${o.orgName} applied`,
    html: shell(`${o.programName} application`, inner, `${o.orgName} applied to work a game.`),
    text: [
      `${o.orgName} applied to the ${o.programName}.`,
      '',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '',
      'What the money would do:',
      o.story,
      '',
      'They are in the draw for the games listed above. Nothing is decided until you pick.',
    ].join('\n'),
  };
}
