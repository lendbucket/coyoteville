'use client';

import { useState } from 'react';
import { SITE } from '@/lib/seo';

/**
 * Nav brand mark. Points at /logo.png. If that file is not there yet the
 * image errors out and we fall back to a rust colored initial, so the nav
 * never renders a broken image icon.
 */
export default function Brand({ href = '/' }: { href?: string }) {
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
          src="/logo.png"
          alt=""
          width={38}
          height={38}
          onError={() => setFailed(true)}
        />
      )}
      <span className="brand__name">{SITE.name}</span>
    </a>
  );
}
