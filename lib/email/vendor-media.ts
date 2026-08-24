import type { VendorMedia } from '../media-email';
import { PRICING } from '../seo';

/**
 * Vendor photos, handed to whoever writes the social post.
 *
 * A working email. No logo, no theme, no hero: the point is that everything
 * needed to write a caption is on screen without having to ask anyone. Light
 * background, plain type, the same as the rest of a normal inbox.
 *
 * The files are attached to the message itself. Nothing here links to storage,
 * because a signed URL will be dead by the time she gets to it.
 */
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spotLabel(spot: string): string {
  if (spot === 'truck') return PRICING.truck.label;
  if (spot === 'booth') return PRICING.booth.label;
  return PRICING.free.label;
}

export type MediaEmailOptions = {
  vendors: VendorMedia[];
  /** Whatever was typed into the note field. May be empty. */
  note: string;
  eventName: string;
  eventDate: string;
  /** True when the images were re-encoded to fit inside an email. */
  downscaled: boolean;
  /** 1-based, only meaningful when a batch was split. */
  part: number;
  totalParts: number;
};

function fileList(v: VendorMedia): string {
  return v.attachments.map((a) => `${a.label}: ${a.filename}`).join('\n');
}

export function renderVendorMediaEmail(opts: MediaEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const { vendors, note, eventName, eventDate, downscaled, part, totalParts } = opts;

  const many = vendors.length > 1;
  const split = totalParts > 1;
  const partSuffix = split ? ` (${part} of ${totalParts})` : '';

  // The suffix goes on both shapes. A split batch whose last email happens to
  // carry one business is still part of that batch, and an unnumbered email
  // arriving after "1 of 2" reads like a separate handoff.
  const subject =
    many || split
      ? `Vendor photos for ${eventName}, ${eventDate}${partSuffix}`
      : `Photos from ${vendors[0]?.businessName ?? 'a vendor'} for ${eventName}, ${eventDate}`;

  const fileCount = vendors.reduce((n, v) => n + v.attachments.length, 0);

  /* ------------------------------------------------------------- html */

  const blocks = vendors
    .map((v) => {
      // The business name is the heading directly above, so it is not repeated here.
      const rows: [string, string][] = [
        ['Contact', v.contactName],
        ['Spot', spotLabel(v.spotType)],
        ['Sells', v.sells],
        ['Files attached', v.attachments.map((a) => `${a.label} — ${a.filename}`).join('<br />') || 'none'],
      ];

      const omitted = v.omitted.length
        ? `<p style="margin:8px 0 0;color:#8A5A00;font-size:13px;">${esc(v.omitted.join('. '))}.</p>`
        : '';

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-top:2px solid #111111;">
  <tr><td style="padding:12px 0 0;font-family:${BODY};">
    <h2 style="margin:0 0 8px;font-size:17px;line-height:24px;color:#111111;">${esc(v.businessName)}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
      ${rows
        .map(
          ([k, val]) =>
            `<tr>
        <td style="padding:3px 12px 3px 0;color:#666666;font-family:${BODY};font-size:13px;vertical-align:top;white-space:nowrap;">${esc(k)}</td>
        <td style="padding:3px 0;font-family:${BODY};font-size:14px;color:#111111;">${k === 'Files attached' ? val : esc(val)}</td>
      </tr>`
        )
        .join('\n      ')}
    </table>
    ${omitted}
  </td></tr>
</table>`;
    })
    .join('\n');

  const noteBlock = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background-color:#FFF6E8;">
  <tr><td style="padding:14px 16px;font-family:${BODY};font-size:15px;line-height:23px;color:#111111;">
    <strong style="display:block;margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#8A5A00;">Note</strong>
    ${esc(note).replace(/\n/g, '<br />')}
  </td></tr>
</table>`
    : '';

  const sizeNote = downscaled
    ? `<p style="margin:0 0 18px;color:#555555;font-family:${BODY};font-size:14px;line-height:22px;">These are web sized copies. They were resized to fit in an email, so they are good for posting but not for print. Ask if you need the originals.</p>`
    : '';

  const splitNote = split
    ? `<p style="margin:0 0 18px;color:#555555;font-family:${BODY};font-size:14px;line-height:22px;">This is email ${part} of ${totalParts}. The rest of the vendors are in the others.</p>`
    : '';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#FFFFFF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="left" style="padding:20px 16px;">
<!--[if mso]><table role="presentation" width="600" align="left" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
  <tr><td style="font-family:${BODY};font-size:15px;line-height:23px;color:#111111;">

    <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#666666;">Coyoteville, ${esc(eventDate)}</p>
    <h1 style="margin:0 0 18px;font-size:20px;line-height:27px;color:#111111;">${
      many
        ? `Photos from ${vendors.length} vendor${vendors.length === 1 ? '' : 's'}`
        : `Photos from ${esc(vendors[0]?.businessName ?? 'a vendor')}`
    }</h1>

    <p style="margin:0 0 18px;">${fileCount} file${fileCount === 1 ? '' : 's'} attached to this email. Everything you need to write the post is below.</p>

    ${splitNote}
    ${noteBlock}
    ${blocks}
    ${sizeNote}

    <p style="margin:0;color:#666666;font-size:13px;">Sent from the Coyoteville vendor tracker.</p>

  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  /* ------------------------------------------------------------- text */

  // Conditional lines are dropped as null. Empty strings are kept, because in
  // a plain text mail the blank lines are the only thing doing the layout.
  const drop = (lines: (string | null)[]) => lines.filter((l): l is string => l !== null);

  const textBlocks = vendors
    .map((v) =>
      drop([
        v.businessName,
        '-'.repeat(Math.min(v.businessName.length, 60)),
        `Contact: ${v.contactName}`,
        `Spot:    ${spotLabel(v.spotType)}`,
        `Sells:   ${v.sells}`,
        '',
        fileList(v) || 'No files',
        v.omitted.length ? `\n${v.omitted.join('. ')}.` : null,
      ]).join('\n')
    )
    .join('\n\n');

  const text = drop([
    `Coyoteville, ${eventDate}`,
    many ? `Photos from ${vendors.length} vendors` : `Photos from ${vendors[0]?.businessName ?? 'a vendor'}`,
    '',
    `${fileCount} file${fileCount === 1 ? '' : 's'} attached to this email.`,
    split ? `This is email ${part} of ${totalParts}. The rest of the vendors are in the others.` : null,
    '',
    note ? `NOTE\n${note}\n` : null,
    textBlocks,
    '',
    downscaled
      ? 'These are web sized copies. They were resized to fit in an email, so they are good for posting but not for print. Ask if you need the originals.'
      : null,
    '',
    'Sent from the Coyoteville vendor tracker.',
  ]).join('\n');

  return { subject, html, text };
}
