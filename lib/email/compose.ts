import { ADDRESS, SITE_URL } from '../seo';
import { LOGO_ALT, LOGO_URL, emailAsset, esc, preheader } from './shared';
import { applyMerge, type MergeContext } from './merge-fields';
import { toEmailHtml, toPlainText } from './rich-text';

/**
 * A written-by-hand email, in the house template.
 *
 * The point of this file is that the composer's preview and the message that
 * actually goes out come from the same function. A preview built from a
 * separate approximation is a preview of nothing; this one is the real
 * renderer, called with the same arguments, so what is on screen at 600px is
 * the email.
 *
 * Same rules as every other template here: nested tables rather than flexbox or
 * grid, every style inlined, a 600px ceiling with an MSO ghost table so Outlook
 * holds it, PNG images on absolute https URLs, solid panel colours because
 * Outlook drops background images, real alt text, a preheader as the first
 * element in the body, and a plain text part.
 *
 * No server-only import, so the browser can call it for the live preview.
 */

const BLACK = '#0B0B0C';
const CREAM = '#F3EEE5';
const MUTED = '#B9B2A6';
const EMBER = '#F0A94B';
const RULE = '#2B2B30';

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PHONE = '540 447 9432';

export type ComposeInput = {
  subject: string;
  /** Inbox preview line. Edited separately from the body on purpose. */
  preheaderText: string;
  /** Raw contenteditable HTML. Sanitised here, never trusted. */
  bodyHtml: string;
  /** Merge values for this recipient. */
  context: MergeContext;
  /** Names of files riding along, listed at the foot of the message. */
  attachmentNames?: string[];
};

/**
 * Preheader fallback.
 *
 * An empty preheader is worse than none: the inbox fills the gap with whatever
 * text comes next, which here would be the logo's alt text. So when nothing is
 * typed, the first line of the body stands in.
 */
export function derivePreheader(bodyHtml: string, typed: string): string {
  const trimmed = typed.trim();
  if (trimmed) return trimmed;

  const text = toPlainText(toEmailHtml(bodyHtml)).replace(/\s+/g, ' ').trim();
  return text.slice(0, 140);
}

export function renderComposeEmail(input: ComposeInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { context } = input;

  // Sanitise first, merge second. The other order would let a business name
  // containing markup reach the output as markup.
  const cleanBody = toEmailHtml(input.bodyHtml);
  const bodyHtml = applyMerge(cleanBody, context, true);

  const subject = applyMerge(input.subject, context, false).trim();
  const previewText = applyMerge(
    derivePreheader(input.bodyHtml, input.preheaderText),
    context,
    false
  );

  const lights = emailAsset('/email/lights.png');
  const names = input.attachmentNames ?? [];

  const attachmentBlock = names.length
    ? `<tr>
    <td style="padding:0 24px 26px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#17171A;border-left:4px solid ${EMBER};">
        <tr><td style="padding:16px 20px;">
          <div style="font-family:${BODY};font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${EMBER};padding-bottom:8px;">
            ${names.length} file${names.length === 1 ? '' : 's'} attached
          </div>
          <div style="font-family:${BODY};font-size:14px;line-height:21px;color:${MUTED};">
            ${names.map((n) => esc(n)).join('<br />')}
          </div>
        </td></tr>
      </table>
    </td>
  </tr>`
    : '';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BLACK};">
${preheader(previewText)}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLACK};">
<tr><td align="center" style="padding:0;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:${BLACK};">

  <tr>
    <td align="center" style="padding:32px 24px 8px;background-color:${BLACK};">
      <img src="${LOGO_URL}" width="240" alt="${LOGO_ALT}" style="display:block;width:240px;max-width:240px;height:auto;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>
  <tr>
    <td style="padding:0;font-size:0;line-height:0;background-color:${BLACK};">
      <img src="${lights}" width="600" alt="String lights strung across the lot" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
    </td>
  </tr>

  <tr>
    <td style="padding:26px 24px 0;background-color:${BLACK};">
      ${bodyHtml || `<p style="margin:0;font-family:${BODY};font-size:16px;line-height:25px;color:${MUTED};">Your message will appear here.</p>`}
    </td>
  </tr>

  ${attachmentBlock}

  <tr>
    <td style="padding:8px 24px 0;background-color:${BLACK};border-top:1px solid ${RULE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding:22px 0 8px;">
          <img src="${LOGO_URL}" width="140" alt="${LOGO_ALT}" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>
        <tr><td align="center" style="padding:0 0 6px;font-family:${BODY};font-size:14px;line-height:22px;color:${CREAM};">
          <a href="tel:5404479432" style="color:${EMBER};text-decoration:none;">${PHONE}</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE_URL}" style="color:${MUTED};text-decoration:underline;">coyoteville.com</a>
        </td></tr>
        <tr><td align="center" style="padding:0 0 28px;font-family:${BODY};font-size:12px;line-height:18px;color:#7C766C;">
          ${esc(ADDRESS.street)}, ${esc(ADDRESS.city)}, ${esc(ADDRESS.state)} ${esc(ADDRESS.zip)}
        </td></tr>
      </table>
    </td>
  </tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    applyMerge(toPlainText(cleanBody), context, false),
    '',
    ...(names.length ? [`${names.length} file${names.length === 1 ? '' : 's'} attached:`, ...names.map((n) => `- ${n}`), ''] : []),
    '---',
    `${PHONE} · ${SITE_URL}`,
    `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.zip}`,
  ].join('\n');

  return { subject, html, text };
}
