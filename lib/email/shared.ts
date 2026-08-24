import { SITE_URL } from '../seo';

/**
 * Pieces shared by the outgoing email templates.
 *
 * No server-only import, so the templates stay renderable and previewable
 * without the send machinery.
 */

export function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Absolute https URL for an emailed image.
 *
 * Inboxes have no origin to resolve a relative path against, and many block
 * plain http. NEXT_PUBLIC_SITE_URL is http://localhost during development, so
 * anything non-https falls back to the canonical domain rather than shipping a
 * link that can never load.
 */
export function emailAsset(path: string): string {
  const base = SITE_URL.startsWith('https://') ? SITE_URL : 'https://coyoteville.com';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const LOGO_URL = emailAsset('/email/logo-email.png');
export const LOGO_ALT = 'Coyoteville Food Truck Park';

/**
 * Hidden preview text, shown by the inbox next to the subject line.
 *
 * Must be the first thing in the body. Two parts matter:
 *
 *   The hiding. display:none alone is not enough, because several clients
 *   ignore it, so this stacks zero height, zero opacity, zero font size,
 *   overflow hidden and mso-hide for Outlook.
 *
 *   The padding. Clients fill the preview from whatever text follows once the
 *   preheader runs out, which is how a preview ends up reading "View in
 *   browser" or the first table cell. The run of zero width non-joiners and
 *   non-breaking spaces after the text soaks up that remaining space so
 *   nothing bleeds in.
 */
export function preheader(text: string): string {
  const padding = '&#847;&zwnj;&nbsp;'.repeat(120);

  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
${esc(text)}
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${padding}</div>
</div>`;
}

/**
 * Dark logo header. The mark is prominent because it is the only branding a
 * blocked-images inbox will fall back to reading, via the alt text.
 */
export function logoHeader(background = '#0B0B0C'): string {
  return `<tr>
    <td align="center" style="padding:30px 24px 12px;background-color:${background};">
      <img src="${LOGO_URL}" width="260" alt="${LOGO_ALT}" style="display:block;width:260px;max-width:260px;height:auto;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>`;
}
