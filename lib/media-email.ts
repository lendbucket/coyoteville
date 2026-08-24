import 'server-only';
import sharp from 'sharp';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { MEDIA_BUCKET, PERMIT_BUCKET } from './uploads';

/**
 * Handing a vendor's logo and photos to whoever is writing the social post.
 *
 * The files travel as real attachments rather than links. Signed URLs expire
 * and the person posting needs to save the images, so a link is no use to them
 * a day later.
 *
 * Two rules run through this whole file:
 *
 *   Permits are never included. A food handler permit is a private regulatory
 *   document that happens to be an image, and it lives in a different bucket
 *   for exactly that reason. Nothing here reads that bucket, and there is a
 *   guard below that throws if a permit path ever reaches the attachment list.
 *
 *   Bytes are read server side with the service role. No public URL is minted
 *   and no signed URL is put in the mail.
 */

/**
 * Ceiling on the raw bytes attached to one email.
 *
 * Mail is base64 encoded in transit, which inflates it by about a third, and
 * most receiving servers stop at 25MB. 15MB of real bytes lands around 20MB on
 * the wire, which clears Gmail with room to spare.
 */
export const MAX_EMAIL_BYTES = 15 * 1024 * 1024;

/** Progressively smaller renditions, tried in order until the batch fits. */
const LADDER = [
  { edge: 2200, quality: 85 },
  { edge: 1600, quality: 80 },
  { edge: 1200, quality: 75 },
  { edge: 1000, quality: 70 },
  { edge: 800, quality: 62 },
] as const;

/** A batch is large by nature, so it starts already reduced to web size. */
const BATCH_BASELINE = { edge: 1600, quality: 80 } as const;

export type MediaAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  /** "Logo", "Photo 1". Used in the body so she knows what she is looking at. */
  label: string;
};

export type VendorMedia = {
  id: string;
  businessName: string;
  contactName: string;
  spotType: string;
  sells: string;
  attachments: MediaAttachment[];
  /** Anything deliberately left out, in words, for the body of the email. */
  omitted: string[];
};

export type VendorRow = {
  id: string;
  business_name: string;
  contact_name: string;
  spot_type: string;
  event_slug: string;
  sells: string;
  logo_path: string | null;
  photo_paths: string[] | null;
  permit_path: string | null;
};

export const MEDIA_COLUMNS =
  'id, business_name, contact_name, spot_type, event_slug, sells, logo_path, photo_paths, permit_path, admin_notes';

/** Filename-safe version of a business name. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'vendor'
  );
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'image/heic' || contentType === 'image/heif') return 'heic';
  return 'jpg';
}

function typeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
}

export function totalBytes(vendors: VendorMedia[]): number {
  return vendors.reduce(
    (sum, v) => sum + v.attachments.reduce((s, a) => s + a.content.length, 0),
    0
  );
}

/**
 * Re-encode one image smaller.
 *
 * Transparency is preserved by staying in PNG when the source has an alpha
 * channel, because a logo flattened onto black is no use for a post. Anything
 * sharp cannot decode, which on some builds includes HEIC, comes back
 * untouched rather than failing the send.
 */
async function shrink(
  attachment: MediaAttachment,
  edge: number,
  quality: number
): Promise<MediaAttachment> {
  if (attachment.contentType === 'application/pdf') return attachment;

  try {
    const image = sharp(attachment.content, { failOn: 'none' });
    const meta = await image.metadata();
    const resized = image.rotate().resize({
      width: edge,
      height: edge,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const hasAlpha = Boolean(meta.hasAlpha);
    const content = hasAlpha
      ? await resized.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await resized.jpeg({ quality, mozjpeg: true }).toBuffer();

    const contentType = hasAlpha ? 'image/png' : 'image/jpeg';

    // A rendition that came out bigger than the original is not a saving.
    if (content.length >= attachment.content.length) return attachment;

    const base = attachment.filename.replace(/\.[^.]+$/, '');
    return {
      ...attachment,
      content,
      contentType,
      filename: `${base}.${extensionFor(contentType)}`,
    };
  } catch (err) {
    console.warn('[send-media] could not resize, sending as is', attachment.filename, err);
    return attachment;
  }
}

async function shrinkVendor(
  vendor: VendorMedia,
  edge: number,
  quality: number
): Promise<VendorMedia> {
  return {
    ...vendor,
    attachments: await Promise.all(vendor.attachments.map((a) => shrink(a, edge, quality))),
  };
}

/**
 * Read one vendor's logo and photos out of storage.
 *
 * Only ever the media bucket, and only ever the logo and photo columns. The
 * permit guard is redundant three times over and stays anyway: this is the one
 * place a private document could leak into an outbound email, and a future
 * edit that widens the column list should fail loudly rather than quietly send
 * someone's permit to a social media assistant.
 */
export async function collectVendorMedia(row: VendorRow): Promise<VendorMedia> {
  const supabase = getSupabaseAdmin();
  const attachments: MediaAttachment[] = [];
  const omitted: string[] = [];
  const name = slug(row.business_name);

  const wanted: { path: string; label: string; base: string }[] = [];

  if (row.logo_path) wanted.push({ path: row.logo_path, label: 'Logo', base: `${name}-logo` });

  (row.photo_paths ?? []).forEach((path, i) => {
    if (path) wanted.push({ path, label: `Photo ${i + 1}`, base: `${name}-photo-${i + 1}` });
  });

  for (const item of wanted) {
    // Never, under any circumstances, a permit.
    if (row.permit_path && item.path === row.permit_path) {
      throw new Error(`refusing to attach the permit path for application ${row.id}`);
    }
    if (item.path.startsWith(`${PERMIT_BUCKET}/`)) {
      throw new Error(`refusing to attach a permit bucket path for application ${row.id}`);
    }

    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(item.path);

    if (error || !data) {
      console.warn('[send-media] could not read file', item.path, error?.message);
      omitted.push(`${item.label} could not be read from storage`);
      continue;
    }

    const content = Buffer.from(await data.arrayBuffer());
    const contentType = data.type && data.type !== 'application/octet-stream'
      ? data.type
      : typeFromPath(item.path);

    attachments.push({
      filename: `${item.base}.${extensionFor(contentType)}`,
      content,
      contentType,
      label: item.label,
    });
  }

  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    spotType: row.spot_type,
    sells: row.sells,
    attachments,
    omitted,
  };
}

/**
 * Shrink one vendor until their files fit inside a single email.
 *
 * Only reached when one business alone is over the ceiling. If even the
 * smallest rendition will not fit, the largest files are dropped and named in
 * the body rather than the whole send failing.
 */
async function forceUnderBudget(vendor: VendorMedia, budget: number): Promise<VendorMedia> {
  let current = vendor;

  for (const step of LADDER) {
    current = await shrinkVendor(vendor, step.edge, step.quality);
    if (totalBytes([current]) <= budget) return current;
  }

  const kept: MediaAttachment[] = [];
  const dropped: string[] = [];
  let running = 0;

  for (const a of current.attachments) {
    if (running + a.content.length <= budget) {
      kept.push(a);
      running += a.content.length;
    } else {
      dropped.push(`${a.label} was too large to attach even at web size`);
    }
  }

  return { ...current, attachments: kept, omitted: [...current.omitted, ...dropped] };
}

export type MediaBatch = {
  vendors: VendorMedia[];
  bytes: number;
};

export type PackedMedia = {
  batches: MediaBatch[];
  /** True when anything was re-encoded, so the body can say so. */
  downscaled: boolean;
};

/**
 * Fit one vendor's files into a single email, shrinking only if needed.
 */
export async function packSingle(vendor: VendorMedia): Promise<PackedMedia> {
  if (totalBytes([vendor]) <= MAX_EMAIL_BYTES) {
    return { batches: [{ vendors: [vendor], bytes: totalBytes([vendor]) }], downscaled: false };
  }

  const fitted = await forceUnderBudget(vendor, MAX_EMAIL_BYTES);
  return { batches: [{ vendors: [fitted], bytes: totalBytes([fitted]) }], downscaled: true };
}

/**
 * Fit many vendors into as few emails as possible.
 *
 * Everything is reduced to web size up front, because a batch of real camera
 * photos is over the ceiling before it starts, and then businesses are packed
 * in order until the next one would not fit. A business is never split across
 * two emails: the person posting works business by business, and half a set of
 * photos in one mail and half in another is worse than one extra email.
 */
export async function packBatch(vendors: VendorMedia[]): Promise<PackedMedia> {
  const withMedia = vendors.filter((v) => v.attachments.length > 0);
  if (withMedia.length === 0) return { batches: [], downscaled: false };

  const before = totalBytes(withMedia);

  const reduced = await Promise.all(
    withMedia.map((v) => shrinkVendor(v, BATCH_BASELINE.edge, BATCH_BASELINE.quality))
  );

  const batches: MediaBatch[] = [];
  let current: VendorMedia[] = [];
  let running = 0;

  for (const vendor of reduced) {
    let v = vendor;
    let size = totalBytes([v]);

    // One business bigger than a whole email gets shrunk further on its own.
    if (size > MAX_EMAIL_BYTES) {
      v = await forceUnderBudget(v, MAX_EMAIL_BYTES);
      size = totalBytes([v]);
    }

    if (current.length && running + size > MAX_EMAIL_BYTES) {
      batches.push({ vendors: current, bytes: running });
      current = [];
      running = 0;
    }

    current.push(v);
    running += size;
  }

  if (current.length) batches.push({ vendors: current, bytes: running });

  return { batches, downscaled: totalBytes(reduced) < before || batches.length > 1 };
}

export {
  mediaSendNote,
  mediaSendsFrom,
  lastMediaSendFrom,
  type MediaSend,
} from './media-log';
