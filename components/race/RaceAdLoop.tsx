'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The ad, as a muted loop that minds its manners.
 *
 * Four rules decide whether it ever downloads anything, and three of them are
 * about somebody else's phone rather than about how the video looks.
 *
 *   Muted, or it will not autoplay at all. Every current browser refuses
 *   autoplay with sound, so this is not a preference, and the unmute button is
 *   how somebody who wants the audio gets it.
 *
 *   The src is attached only when the frame is actually on screen. preload is
 *   "none" and the element starts with no source at all, so the 2.9MB is spent
 *   on people who scrolled to it and on nobody else. The homepage is the page
 *   that collects the bounces and a bounce should cost nothing.
 *
 *   Reduced motion gets the logo and a play button. A silent looping video is
 *   the exact content that setting exists for, so this is a requirement rather
 *   than a courtesy, and the video is still there for anybody who taps.
 *
 *   A metered or slow connection gets the same treatment. saveData is somebody
 *   saying so out loud; 2g and slow-2g is the browser saying it for them. Alice
 *   is not a strong signal town and this is a page people open in a parking
 *   lot.
 *
 * It pauses when it leaves the viewport. A video playing in a section nobody is
 * looking at is burning battery and data for nothing.
 */

type Connection = {
  saveData?: boolean;
  effectiveType?: string;
};

/** Does this device want us to leave it alone? */
function shouldHoldBack(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  } catch {
    /* No matchMedia is not a reason to autoplay at somebody. */
    return true;
  }

  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (connection?.saveData === true) return true;
  if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return true;

  return false;
}

export default function RaceAdLoop({ src, logo }: { src: string; logo?: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  /** Null until the browser has been asked. Null means "do nothing yet". */
  const [holdBack, setHoldBack] = useState<boolean | null>(null);
  /** True once the src is attached. Never goes back: the file is downloaded. */
  const [armed, setArmed] = useState(false);
  /* Whether it should be playing, as opposed to whether it has a source.

     These have to be two separate things. setArmed is what attaches the src,
     and attaching it is a React render: calling play() in the same callback,
     even deferred with queueMicrotask, runs before that render commits, so
     play() lands on a video element with no source, rejects, and nothing
     retries once the src arrives. That is exactly what it did. The video
     stayed paused at readyState 0 and never fetched a byte, which looked
     like a working lazy load and was a player that never played. */
  const [wantsPlay, setWantsPlay] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    setHoldBack(shouldHoldBack());
  }, []);

  /* Arm and play when the frame comes into view, pause when it leaves. The
     observer is set up only once the device has been asked, so a reduced
     motion reader never has one watching them. */
  useEffect(() => {
    if (holdBack !== false) return;

    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = videoRef.current;
          if (!video) continue;

          if (entry.isIntersecting) {
            setArmed(true);
            setWantsPlay(true);
          } else {
            setWantsPlay(false);
            video.pause();
          }
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(frame);
    return () => observer.disconnect();
  }, [holdBack]);

  /* Play once the source is attached and it is wanted, not before.

     Depending on armed means this runs after the render that set the src, so
     the element has something to load. A rejected promise is fine and
     expected: the controls are right there, and a browser that refuses to
     autoplay is not one to argue with. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !armed) return;

    if (wantsPlay) {
      video.muted = true;
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [armed, wantsPlay]);

  /** The manual path: reduced motion, a slow connection, or a refused autoplay. */
  const start = useCallback(() => {
    /* Same two steps, same reason: the effect above does the playing once the
       src is on the element. */
    setArmed(true);
    setWantsPlay(true);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    /* Unmuting is a deliberate act, so it also means play if it was not. */
    if (!next) void video.play().catch(() => {});
  }, []);

  const manual = holdBack !== false;

  return (
    <div className="racead">
      <div className="racead__frame" ref={frameRef}>
        <video
          ref={videoRef}
          className="racead__video"
          /* Attached only when armed. Before that the element holds no source
             and the browser fetches nothing at all.

             No poster attribute, and deliberately no substitute for one. A
             media fragment like #t=0.1, or preload="metadata", would paint a
             first frame by starting the download, which is the one thing this
             deferral exists to prevent. What fills the frame instead is the
             logo behind this element. */
          src={armed ? src : undefined}
          preload="none"
          controls
          playsInline
          muted
          /* No loop under reduced motion: it plays once if they ask for it. */
          loop={!manual}
          aria-label="A short film about the Coyoteville Turkey Trot"
        />

        {!armed ? (
          <button className="racead__play" type="button" onClick={start}>
            <span className="racead__playicon" aria-hidden="true" />
            <span className="racead__playlabel">
              {manual ? 'Play the film' : 'Play'}
            </span>
          </button>
        ) : (
          <button
            className="racead__mute"
            type="button"
            onClick={toggleMute}
            aria-pressed={!muted}
          >
            {muted ? 'Sound on' : 'Sound off'}
          </button>
        )}
      </div>
    </div>
  );
}
