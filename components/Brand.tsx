'use client';

import { useState } from 'react';
import { SITE } from '@/lib/seo';

/**
 * Brand mark. Points at /logo.svg so the badge stays crisp at any size. If that
 * file is not there yet the image errors out and we fall back to a rust colored
 * initial, so the nav never renders a broken image icon.
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
  const [failed, setFailed] = useState(false);

  return (
    <a className="brand" href={href} aria-label={`${SITE.name} home`}>
      {failed ? (
        <span className="brand__fallback" aria-hidden="true">
          C
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="brand__mark"
          src={SITE.logoSvg}
          alt=""
          width={Math.round(size * 1.5)}
          height={size}
          style={{ '--brand-h': `${size}px` } as React.CSSProperties}
          loading={eager ? 'eager' : 'lazy'}
          decoding={eager ? 'sync' : 'async'}
          onError={() => setFailed(true)}
        />
      )}
      {showName && <span className="brand__name">{SITE.name}</span>}
    </a>
  );
}
