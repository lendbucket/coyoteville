import type { ResponsivePhoto } from '@/lib/photos';

/**
 * Responsive image.
 *
 * Serves pre-built width variants through <picture>, WebP first with a JPEG
 * fallback. The variants are generated ahead of time and shipped in
 * public/photos, so there is no image transform at request time and nothing to
 * configure on the host.
 *
 * `sizes` is required because the browser picks a candidate before layout, so
 * it cannot work the width out on its own. Give it the real rendered width.
 */
export default function Photo({
  photo,
  sizes,
  className,
  priority = false,
  cover = false,
}: {
  photo: ResponsivePhoto;
  /** CSS sizes attribute, eg "(max-width: 900px) 100vw, 55vw". */
  sizes: string;
  className?: string;
  /** Above the fold. Loads eagerly and is not lazy decoded. */
  priority?: boolean;
  /** Fills its positioned parent and crops rather than letterboxing. */
  cover?: boolean;
}) {
  const base = `/photos/${photo.file}`;
  const srcSet = (ext: 'webp' | 'jpg') =>
    photo.widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');

  const widest = photo.widths[photo.widths.length - 1];

  return (
    <picture>
      <source type="image/webp" srcSet={srcSet('webp')} sizes={sizes} />
      <img
        className={[cover ? 'photo--cover' : 'photo', className].filter(Boolean).join(' ')}
        src={`${base}-${widest}.jpg`}
        srcSet={srcSet('jpg')}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : undefined}
      />
    </picture>
  );
}
