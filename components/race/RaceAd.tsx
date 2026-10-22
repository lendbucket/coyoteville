'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The ad, in a phone.
 *
 * It was shot 9:16 and it stays 9:16. Letterboxing a vertical video across a
 * desktop hero gives two black bars and a postage stamp, which is the usual
 * thing to do with vertical video and is worse than not showing it: the whole
 * reason it reads well is that it fills a phone, so on a desktop it is rendered
 * inside something phone shaped and left alone.
 *
 * Nothing downloads until somebody asks for it. preload="none" with the poster
 * as the only thing fetched, which matters because the audience for this page
 * is on a phone on cell data and the file is nearly three megabytes.
 *
 * It plays itself only when it is actually on screen, muted, and only when the
 * reader has not asked for less motion. Autoplaying off screen is how a page
 * spends somebody's data on something they never saw.
 */
export default function RaceAd({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Reduced motion gets the poster and the controls and nothing moving. */
    if (reduced || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            /* Muted, because a video that makes noise at somebody unasked is
               the reason autoplay policies exist. A rejected play is fine: the
               controls are right there. */
            video.muted = true;
            void video.play().then(() => setStarted(true)).catch(() => {});
          } else if (!entry.isIntersecting) {
            video.pause();
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [started]);

  return (
    <div className="racead">
      <div className="racead__phone">
        <video
          ref={videoRef}
          className="racead__video"
          src={src}
          poster={poster}
          preload="none"
          controls
          playsInline
          muted
          loop
          /* The one line a screen reader gets. The ad has no narration worth
             transcribing and the page says everything it says. */
          aria-label="A short film about the Coyoteville Turkey Trot"
        />
      </div>
    </div>
  );
}
