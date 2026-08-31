import { SITE } from '@/lib/seo';

/**
 * Brand mark.
 *
 * A server component. It used to carry 'use client' for a single useState that
 * swapped in a rust coloured "C" if /logo.svg failed to load, which made the
 * nav a hydration boundary and shipped React state to the browser for a case
 * that cannot happen: the file is committed to the repo and served from the
 * same origin as the page asking for it. If it 404s, the site is already
 * broken in ways an initial does not rescue.
 *
 * The badge is 3:2, so width and height are set to that ratio to reserve the
 * right amount of layout space and avoid a shift while the asset loads.
 */
export default function Brand({
  href = '/',
  size = 100,
  showName = false,
  eager = true,
}: {
  href?: string;
  /** Rendered height of the badge in px. Width follows the 3:2 ratio. */
  size?: number;
  showName?: boolean;
  /** The nav mark is above the fold; the footer one is not. */
  eager?: boolean;
}) {
  return (
    <a className="brand" href={href} aria-label={`${SITE.name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="brand__mark"
        src={SITE.logoSvg}
        alt=""
        width={Math.round(size * 1.5)}
        height={size}
        style={{ '--brand-h': `${size}px` } as React.CSSProperties}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
      />
      {showName && <span className="brand__name">{SITE.name}</span>}
    </a>
  );
}
