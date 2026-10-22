'use client';

import { useEffect } from 'react';

/**
 * Arms the course map, then draws it when it scrolls into view.
 *
 * THE ORDER IS THE POINT, and it is the opposite of what shipped before.
 *
 * The map now renders fully drawn with no JavaScript at all. Script is only
 * allowed to take that away: on mount this adds .ttc-armed to the svg, which
 * hides the line and sets it undrawn, and on entry it adds .ttc-draw, which
 * animates it in.
 *
 * The previous version had it backwards. CSS in the page hid the line and the
 * script was what revealed it, so anything that stopped the script, a bundle
 * that failed to load, an error earlier on the page, a browser with JavaScript
 * off, left a blank grid with nothing on it. Any failure here leaves a drawn
 * map instead, which is the state somebody actually wants to see.
 *
 * Renders nothing and receives nothing. It finds the container by id, so the
 * inlined SVG stays server rendered markup rather than becoming a prop.
 *
 * Reduced motion is handled inside the SVG: armed plus reduced motion resolves
 * to drawn with no animation, so it is correct whether or not the observer
 * ever fires.
 */
export default function CourseMapReveal({ targetId }: { targetId: string }) {
  useEffect(() => {
    const container = document.getElementById(targetId);
    const svg = container?.querySelector('svg');
    if (!svg) return;

    /* Step one: take the drawn map away. Nothing before this point may hide
       it, which is why there is no CSS in the page doing so. */
    svg.classList.add('ttc-armed');

    const draw = () => svg.classList.add('ttc-draw');

    if (typeof IntersectionObserver === 'undefined') {
      draw();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          /* Once. A map that redraws on every scroll past is a fidget. */
          draw();
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(container as Element);
    return () => observer.disconnect();
  }, [targetId]);

  return null;
}
