import type { VendorMedia } from '../media-email';
import { ADDRESS, PRICING, SITE_URL } from '../seo';
import { LOGO_ALT, LOGO_URL, emailAsset, esc, preheader } from './shared';

/**
 * Vendor photos, handed to whoever writes the social post.
 *
 * A working document, but one that should look like it came from a real
 * business rather than a script, so it runs on the same design system as the
 * vendor confirmation and under the same rules:
 *
 *   Nested tables for layout. Outlook ignores flexbox and grid entirely.
 *   Every style inlined. Most clients strip anything in <head>.
 *   No CSS custom properties, for the same reason.
 *   600px maximum width, with an MSO ghost table so Outlook holds it.
 *   No SVG. The logo and the string lights are PNGs on an absolute https URL.
 *   No background images. Every panel is a solid table cell colour.
 *   A display face that degrades to Impact then Arial Black.
 *   Real alt text, because images are blocked by default in a lot of inboxes.
 *   A preheader as the very first element, so the inbox preview reads as a
 *     sentence rather than pulling the first markup it finds.
 *   A plain text part alongside the HTML.
 *
 * The files themselves ride as attachments. Nothing here links to storage,
 * because a signed URL is dead by the time she opens this.
 */

/* Palette, repeated literally rather than shared, because custom properties do
   not survive the trip into an inbox. */
const BLACK = '#0B0B0C';
const PANEL = '#17171A';
const PANEL_2 = '#1F1F23';
const CREAM = '#F3EEE5';
const MUTED = '#B9B2A6';
const RUST = '#C4552B';
const EMBER = '#F0A94B';
const RULE = '#2B2B30';

const DISPLAY = "Impact, 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PHONE = '540 447 9432';

function spotLabel(spot: string): string {
  if (spot === 'truck') return PRICING.truck.label;
  if (spot === 'booth') return PRICING.booth.label;
  return PRICING.free.label;
}

/** "Aug 28" from an event's ISO date, for a subject line that scans. */
export function shortEventDate(isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed)) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(parsed));
}

/** One label and value row inside a business card. */
function detailRow(label: string, value: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${RULE};`;
  return `<tr>
    <td style="${border}padding:10px 0;font-family:${BODY};font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="${border}padding:10px 0 10px 16px;font-family:${BODY};font-size:15px;font-weight:bold;color:${CREAM};vertical-align:top;">${value}</td>
  </tr>`;
}

/** One business, as a card. Used once for a single vendor and stacked for a batch. */
function businessCard(v: VendorMedia, eventName: string, eventDate: string): string {
  const files = v.attachments.length
    ? v.attachments
        .map(
          (a) =>
            `<span style="color:${EMBER};">${esc(a.label)}</span> <span style="font-weight:normal;color:${MUTED};">${esc(a.filename)}</span>`
        )
        .join('<br />')
    : `<span style="font-weight:normal;color:${MUTED};">None</span>`;

  const omitted = v.omitted.length
    ? `<tr><td colspan="2" style="padding:12px 0 0;font-family:${BODY};font-size:13px;line-height:19px;color:${EMBER};">${esc(v.omitted.join('. '))}.</td></tr>`
    : '';

  return `<tr>
    <td style="padding:0 24px 18px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border-left:4px solid ${EMBER};">
        <tr><td style="padding:20px 22px;">
          <div style="font-family:${DISPLAY};font-size:26px;line-height:30px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};padding-bottom:14px;">${esc(v.businessName)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${detailRow('Contact', esc(v.contactName))}
            ${detailRow('Spot', esc(spotLabel(v.spotType)))}
            ${detailRow('Sells', esc(v.sells))}
            ${detailRow('Event', esc(eventName))}
            ${detailRow('Date', esc(eventDate))}
            ${detailRow('Files', files, true)}
            ${omitted}
          </table>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

export type MediaEmailOptions = {
  vendors: VendorMedia[];
  /** Whatever was typed into the note field. May be empty. */
  note: string;
  eventName: string;
  /** Long form, "Friday, August 28, 2026". */
  eventDate: string;
  /** The event's ISO date, "2026-08-28", for the short subject line. */
  eventDateISO: string;
  /** True when the images were re-encoded to fit inside an email. */
  downscaled: boolean;
  /** 1-based, only meaningful when a batch was split. */
  part: number;
  totalParts: number;
};

export function renderVendorMediaEmail(opts: MediaEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const { vendors, note, eventName, eventDate, eventDateISO, downscaled, part, totalParts } = opts;

  const many = vendors.length > 1;
  const split = totalParts > 1;
  const short = shortEventDate(eventDateISO);
  const fileCount = vendors.reduce((n, v) => n + v.attachments.length, 0);
  const lights = emailAsset('/email/lights.png');

  /* --------------------------------------------------------- subject */

  // Leads with what it is, then who it is about, then when. A batch that was
  // split says so, because an unnumbered part reads like a separate handoff.
  const subject =
    many || split
      ? `Coyoteville photos, ${vendors.length} vendor${vendors.length === 1 ? '' : 's'}, ${short}${
          split ? `, part ${part} of ${totalParts}` : ''
        }`
      : `Coyoteville photos, ${vendors[0]?.businessName ?? 'a vendor'}, ${short}`;

  const previewText = many
    ? `${fileCount} file${fileCount === 1 ? '' : 's'} from ${vendors.length} vendors, ready to post.`
    : `${fileCount} file${fileCount === 1 ? '' : 's'} from ${vendors[0]?.businessName ?? 'a vendor'}, ready to post.`;

  /* ------------------------------------------------------------ html */

  const countStrip = `<tr>
    <td style="padding:0 24px 22px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL_2};">
        <tr><td align="center" style="padding:14px 18px;font-family:${BODY};font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:${EMBER};line-height:20px;">
          ${vendors.length} vendor${vendors.length === 1 ? '' : 's'} &middot; ${fileCount} file${fileCount === 1 ? '' : 's'}${
            split ? ` &middot; part ${part} of ${totalParts}` : ''
          }
        </td></tr>
      </table>
    </td>
  </tr>`;

  const noteBlock = note
    ? `<tr>
    <td style="padding:0 24px 24px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PANEL};border:2px solid ${RUST};">
        <tr><td style="padding:20px 22px;">
          <div style="font-family:${BODY};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${EMBER};padding-bottom:10px;">Note from Robert</div>
          <div style="font-family:${BODY};font-size:16px;line-height:25px;color:${CREAM};">${esc(note).replace(/\n/g, '<br />')}</div>
        </td></tr>
      </table>
    </td>
  </tr>`
    : '';

  /**
   * Where the note sits relative to the cards.
   *
   * One vendor, and it reads as a comment on that card, so it follows it.
   * A batch, and it is about the whole send, so it goes above the stack
   * rather than under eight cards where nobody would find it.
   */
  const noteAboveCards = many || split;

  const attachLine = `<tr>
    <td style="padding:0 24px 28px;background-color:${BLACK};">
      <div style="font-family:${BODY};font-size:15px;line-height:23px;color:${CREAM};">
        <strong>${fileCount} file${fileCount === 1 ? '' : 's'} ${fileCount === 1 ? 'is' : 'are'} attached to this email.</strong>${
          downscaled
            ? ` <span style="color:${MUTED};">They are web sized copies, resized to fit in an email. Good for posting, not for print. Ask if you need the originals.</span>`
            : ''
        }
      </div>
    </td>
  </tr>`;

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

  <!-- header -->
  <tr>
    <td align="center" style="padding:32px 24px 8px;background-color:${BLACK};">
      <img src="${LOGO_URL}" width="260" alt="${LOGO_ALT}" style="display:block;width:260px;max-width:260px;height:auto;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>
  <tr>
    <td style="padding:0;font-size:0;line-height:0;background-color:${BLACK};">
      <img src="${lights}" width="600" alt="String lights strung across the lot" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
    </td>
  </tr>

  <!-- headline -->
  <tr>
    <td align="center" style="padding:22px 24px 6px;background-color:${BLACK};">
      <div style="font-family:${DISPLAY};font-size:30px;line-height:34px;letter-spacing:0.5px;text-transform:uppercase;color:${CREAM};">Vendor photos ready to post</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 24px 24px;background-color:${BLACK};">
      <div style="font-family:${BODY};font-size:16px;line-height:24px;color:${MUTED};">
        Everything you need to write the ${many ? 'posts' : 'post'} is below.
      </div>
    </td>
  </tr>

  ${many || split ? countStrip : ''}
  ${noteAboveCards ? noteBlock : ''}
  ${vendors.map((v) => businessCard(v, eventName, eventDate)).join('\n')}
  ${noteAboveCards ? '' : noteBlock}
  ${attachLine}

  <!-- footer -->
  <tr>
    <td style="padding:0 24px;background-color:${BLACK};border-top:1px solid ${RULE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding:24px 0 10px;">
          <img src="${LOGO_URL}" width="150" alt="${LOGO_ALT}" style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>
        <tr><td align="center" style="padding:0 0 10px;font-family:${BODY};font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:${EMBER};line-height:19px;">
          ${esc(eventName)} &middot; ${esc(eventDate)}
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

  /* ------------------------------------------------------------ text */

  // Conditional lines are dropped as null. Empty strings are kept, because in
  // a plain text mail the blank lines are the only thing doing the layout.
  const drop = (lines: (string | null)[]) => lines.filter((l): l is string => l !== null);

  const textBlocks = vendors
    .map((v) =>
      drop([
        // Real casing, not uppercased. The HTML card only uppercases visually,
        // so the name stays copyable there; hard uppercasing here would be the
        // one place the exact business name is lost, and it is the thing she
        // has to type into the post.
        v.businessName,
        '-'.repeat(Math.min(v.businessName.length, 60)),
        `Contact: ${v.contactName}`,
        `Spot:    ${spotLabel(v.spotType)}`,
        `Sells:   ${v.sells}`,
        `Event:   ${eventName}`,
        `Date:    ${eventDate}`,
        '',
        v.attachments.length
          ? v.attachments.map((a) => `${a.label}: ${a.filename}`).join('\n')
          : 'No files',
        v.omitted.length ? `\n${v.omitted.join('. ')}.` : null,
      ]).join('\n')
    )
    .join('\n\n');

  const text = drop([
    'VENDOR PHOTOS READY TO POST',
    '',
    many
      ? 'Everything you need to write the posts is below.'
      : 'Everything you need to write the post is below.',
    '',
    many || split
      ? `${vendors.length} vendor${vendors.length === 1 ? '' : 's'} · ${fileCount} file${fileCount === 1 ? '' : 's'}${
          split ? ` · part ${part} of ${totalParts}` : ''
        }`
      : null,
    many || split ? '' : null,
    note && noteAboveCards ? `NOTE FROM ROBERT\n${note}\n` : null,
    textBlocks,
    note && !noteAboveCards ? `\nNOTE FROM ROBERT\n${note}` : null,
    '',
    `${fileCount} file${fileCount === 1 ? '' : 's'} ${fileCount === 1 ? 'is' : 'are'} attached to this email.`,
    downscaled
      ? 'They are web sized copies, resized to fit in an email. Good for posting, not for print. Ask if you need the originals.'
      : null,
    '',
    '---',
    `${eventName} · ${eventDate}`,
    `${PHONE} · ${SITE_URL}`,
    `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.zip}`,
  ]).join('\n');

  return { subject, html, text };
}
