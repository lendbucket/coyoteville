'use client';

import { useEffect } from 'react';

/**
 * Starts the course map's draw when it scrolls into view, once.
 *
 * The map's animation is CSS inside the SVG, so it began at page load and
 * finished about three and a half seconds later, while the visitor was still
 * looking at the hero. By the time anybody scrolled down to it, it had already
 * drawn. The animation was real and nobody was ever going to see it.
 *
 * This renders NOTHING. It finds the container by id and adds a class, so the
 * 7.6 kB of inlined SVG stays server rendered markup and never becomes a prop,
 * a child, or a serialized payload. Same reason the waiver is a sibling rather
 * than a child.
 *
 * Reduced motion never gets here: the page only mounts this when the visitor
 * has not asked for less movement, and the SVG's own media query draws it
 * complete either way.
 */
export default function CourseMapReveal({ targetId }: { targetId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;

    /* Asked for less movement: draw it now and do not observe anything. */
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        target.classList.add('is-drawn');
        return;
      }
    } catch {
      target.classList.add('is-drawn');
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      target.classList.add('is-drawn');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          /* Once. A map that redraws every time somebody scrolls past is a
             fidget, not a reveal. */
          entry.target.classList.add('is-drawn');
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return null;
}
