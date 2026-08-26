import 'server-only';
import { getSupabaseAdmin } from './supabase';

/**
 * Vendor upload handling.
 *
 * Everything here runs on the server. The browser never talks to Supabase
 * Storage directly, which keeps the CSP connect-src at 'self' and means the
 * size and type rules below are the real gate rather than a client side hint.
 *
 * Two buckets, both private:
 *   PERMIT_BUCKET  health permits. Sensitive, never public.
 *   MEDIA_BUCKET   logos and spotlight photos.
 *
 * Reads happen through short lived signed URLs minted by the service role.
 */

export const PERMIT_BUCKET = 'coyoteville-permits';
export const MEDIA_BUCKET = 'coyoteville-media';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 3;

/**
 * Ceiling on the whole request.
 *
 * A phone photo is commonly 3 to 6MB, so a logo, three photos and a permit
 * straight off a camera roll is around 20MB. That is over four times the 4.5MB
 * body limit a serverless function classically accepts, and 80 to 160 seconds
 * of upload on a phone connection. The browser shrinks images before sending
 * (see compressImage in VendorForm), and this is the backstop for anything that
 * still arrives too large, including PDFs, which are not compressed.
 */
export const MAX_TOTAL_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Longest edge and JPEG quality the browser resizes photos down to. */
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_QUALITY = 0.82;

/**
 * Allowed types, mapped to the extension we store them under. The extension is
 * derived from the type we verified, never from the filename the browser sent.
 */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

/** Human list used in error messages and helper text. */
export const ALLOWED_LABEL = 'JPG, PNG, WEBP, HEIC or PDF';

export type UploadKind = 'logo' | 'photo' | 'permit';

export type ValidatedUpload = {
  kind: UploadKind;
  file: File;
  extension: string;
  /** Canonical type, from sniffing. Never the browser's claim. */
  contentType: string;
};

/**
 * Collapse the aliases onto one type per format.
 *
 * image/pjpeg is an old alias for JPEG. HEIF and HEIC are the same ISO base
 * media container and the byte signature cannot tell them apart, so both
 * resolve to image/heic. Everything downstream, including what is handed to
 * storage, uses the canonical value.
 */
function canonicalType(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'image/pjpeg') return 'image/jpeg';
  if (t === 'image/heif') return 'image/heic';
  return t;
}

/**
 * Magic-number check. A browser sets the MIME type from the file extension, so
 * it is a claim and not evidence. This reads the first bytes and confirms the
 * container actually matches what was claimed.
 */
async function sniff(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const at = (i: number) => head[i];

  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'application/pdf';

  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(head.slice(start, start + len)));

  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';

  // HEIC/HEIF are ISO base media files; the brand sits in the ftyp box.
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
      return 'image/heic';
    }
  }

  return null;
}

export class UploadError extends Error {}

/**
 * Validate one uploaded file. Throws UploadError with a message meant for the
 * vendor, so the route can surface it directly.
 */
export async function validateUpload(
  file: File,
  kind: UploadKind,
  label: string
): Promise<ValidatedUpload> {
  if (file.size === 0) {
    throw new UploadError(`${label} came through empty. Pick the file again.`);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new UploadError(
      `${label} is ${mb}MB. The limit is 10MB, so shrink it or take a smaller photo.`
    );
  }

  const claimed = (file.type || '').toLowerCase();
  if (!ALLOWED[claimed]) {
    throw new UploadError(`${label} has to be ${ALLOWED_LABEL}.`);
  }

  const actual = await sniff(file);
  if (!actual) {
    // Lowercased because the label leads its own sentences elsewhere but sits
    // mid sentence here.
    throw new UploadError(
      `We could not read ${label.charAt(0).toLowerCase()}${label.slice(1)}. Save it as ${ALLOWED_LABEL} and try again.`
    );
  }

  const contentType = canonicalType(actual);
  if (contentType !== canonicalType(claimed)) {
    throw new UploadError(
      `${label} does not look like a ${claimed.split('/')[1]?.toUpperCase()} file. Re-save it and try again.`
    );
  }

  return { kind, file, extension: ALLOWED[contentType], contentType };
}

/**
 * Store a validated file under an application's folder and return its path.
 * Paths are derived server side; nothing from the client reaches the key.
 */
export async function storeUpload(
  upload: ValidatedUpload,
  applicationId: string,
  index = 0
): Promise<string> {
  const bucket = upload.kind === 'permit' ? PERMIT_BUCKET : MEDIA_BUCKET;
  const name =
    upload.kind === 'photo'
      ? `photo-${index + 1}.${upload.extension}`
      : `${upload.kind}.${upload.extension}`;
  const path = `${applicationId}/${name}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, upload.file, {
      // The sniffed type, not the browser's claim, so the value always matches
      // what the bucket allows.
      contentType: upload.contentType,
      upsert: true,
      cacheControl: '3600',
    });

  if (error) throw new UploadError(`We could not save your ${upload.kind}. Try again in a minute.`);

  return path;
}

export function bucketForPath(kind: UploadKind): string {
  return kind === 'permit' ? PERMIT_BUCKET : MEDIA_BUCKET;
}

/**
 * Mint a short lived signed URL. Ten minutes is long enough to open a permit at
 * the gate and short enough that a copied link stops working quickly.
 */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 600
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
