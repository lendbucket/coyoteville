import 'server-only';
import sharp from 'sharp';

/**
 * Files picked off a phone, fitted into an email.
 *
 * Same handling as the photo sender and for the same reason: mail is base64
 * encoded in transit, which inflates it by about a third, and most receiving
 * servers stop at 25MB. So the ceiling here is on real bytes, and going over it
 * shrinks images rather than failing the send. A phone camera photo is commonly
 * 3 to 6MB and nobody attaching four of them means to send 20MB.
 *
 * PDFs and anything sharp cannot decode pass through untouched. Failing a whole
 * send because one file was a HEIC would be worse than sending it as it is.
 */

/** 15MB of real bytes lands around 20MB on the wire, which clears Gmail. */
export const MAX_EMAIL_BYTES = 15 * 1024 * 1024;

/** Per file ceiling before anything is even considered. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const MAX_FILES = 10;

export type OutgoingAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

/** Successive passes, each smaller than the last. */
const STEPS: { edge: number; quality: number }[] = [
  { edge: 2000, quality: 82 },
  { edge: 1600, quality: 76 },
  { edge: 1200, quality: 70 },
  { edge: 900, quality: 64 },
];

function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, '-')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || 'attachment';
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/') && contentType !== 'image/svg+xml';
}

function total(list: OutgoingAttachment[]): number {
  return list.reduce((n, a) => n + a.content.length, 0);
}

async function shrink(
  attachment: OutgoingAttachment,
  edge: number,
  quality: number
): Promise<OutgoingAttachment> {
  if (!isImage(attachment.contentType)) return attachment;

  try {
    const image = sharp(attachment.content, { failOn: 'none' });
    const meta = await image.metadata();

    const resized = image.rotate().resize({
      width: edge,
      height: edge,
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Transparency is kept as PNG. Flattening a logo onto black would ruin it.
    const hasAlpha = Boolean(meta.hasAlpha);
    const content = hasAlpha
      ? await resized.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await resized.jpeg({ quality, mozjpeg: true }).toBuffer();

    // A rendition that came out bigger than the original is not a saving.
    if (content.length >= attachment.content.length) return attachment;

    const base = attachment.filename.replace(/\.[^.]+$/, '');
    return {
      filename: `${base}.${hasAlpha ? 'png' : 'jpg'}`,
      content,
      contentType: hasAlpha ? 'image/png' : 'image/jpeg',
    };
  } catch (err) {
    console.warn('[attachments] could not resize, sending as is', attachment.filename, err);
    return attachment;
  }
}

export type FittedAttachments = {
  attachments: OutgoingAttachment[];
  /** True when at least one image was re-encoded to fit. */
  downscaled: boolean;
  /** True when even the smallest pass could not get under the ceiling. */
  tooBig: boolean;
};

/**
 * Read the uploaded files and get them under the ceiling.
 *
 * Steps down through progressively smaller renditions and stops at the first
 * one that fits, rather than jumping straight to the smallest, so a set that
 * was only slightly over keeps most of its quality.
 */
export async function fitAttachments(files: File[]): Promise<FittedAttachments> {
  const capped = files.slice(0, MAX_FILES);

  let attachments: OutgoingAttachment[] = [];
  for (const file of capped) {
    if (file.size > MAX_FILE_BYTES) {
      return { attachments: [], downscaled: false, tooBig: true };
    }
    attachments.push({
      filename: safeName(file.name),
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || 'application/octet-stream',
    });
  }

  if (total(attachments) <= MAX_EMAIL_BYTES) {
    return { attachments, downscaled: false, tooBig: false };
  }

  for (const step of STEPS) {
    attachments = await Promise.all(attachments.map((a) => shrink(a, step.edge, step.quality)));
    if (total(attachments) <= MAX_EMAIL_BYTES) {
      return { attachments, downscaled: true, tooBig: false };
    }
  }

  return { attachments, downscaled: true, tooBig: true };
}
