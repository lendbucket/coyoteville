'use client';

import { useEffect } from 'react';

/**
 * Collapses the sticky header once the page has moved.
 *
 * Behaviour, not content, so it is a bare effect rather than a wrapper: the
 * header itself stays a server component and renders its links in the HTML,
 * which matters because they are the site's navigation.
 *
 * Toggling a class on the existing element rather than lifting the header into
 * client state means nothing re-renders on scroll. The listener is passive and
 * the work is one classList call guarded by a comparison, so scrolling does not
 * pay for this.
 *
 * Without JS the header stays at full height, which is exactly how it behaved
 * before. Nothing is hidden that only script can bring back.
 */

/** Far enough that a small nudge does not flip it, close enough to feel prompt. */
const THRESHOLD = 24;

export default function NavShrink() {
  useEffect(() => {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let slim = false;

    const apply = () => {
      const next = window.scrollY > THRESHOLD;
      if (next === slim) return;
      slim = next;
      nav.classList.toggle('is-slim', next);
    };

    apply();
    window.addEventListener('scroll', apply, { passive: true });

    return () => {
      window.removeEventListener('scroll', apply);
      nav.classList.remove('is-slim');
    };
  }, []);

  return null;
}
