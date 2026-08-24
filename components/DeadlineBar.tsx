'use client';

import { useEffect, useRef, useState } from 'react';
import Countdown, { pad } from './Countdown';

/**
 * Sticky signup deadline bar, pinned above the nav on every page.
 *
 * The server decides the target instant and hands over its own clock. When the
 * countdown runs out this swaps to a closed state in place, without a reload.
 * Closing the form for real is enforced on the server: the API route rejects
 * late applications regardless of what this bar is showing.
 */
export default function DeadlineBar({
  targetMs,
  serverNowMs,
  closesDisplay,
  zoneLabel,
  initiallyClosed,
}: {
  targetMs: number;
  serverNowMs: number;
  closesDisplay: string;
  zoneLabel: string;
  initiallyClosed: boolean;
}) {
  const [closed, setClosed] = useState(initiallyClosed);
  const barRef = useRef<HTMLDivElement>(null);

  /**
   * Publish the bar's real height as --deadline-h.
   *
   * The nav parks below this bar and anchor scrolling has to clear both, and
   * the bar's height changes with how its contents wrap. The CSS defaults are
   * deliberately the tallest value in each band so nothing can be hidden before
   * this runs; this then makes it exact, and keeps it exact through a rotate or
   * a resize.
   */
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const apply = () => {
      document.documentElement.style.setProperty(
        '--deadline-h',
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    };

    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener('resize', apply);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [closed]);

  if (closed) {
    return (
      <div className="deadline deadline--closed" role="status" ref={barRef}>
        <div className="shell deadline__inner">
          <span className="deadline__label">Vendor signup is closed for this event</span>
          <span className="deadline__note">
            Closed {closesDisplay} {zoneLabel}. Email us and we will get you on the next one.
          </span>
          <a className="deadline__cta" href="#visit">
            Next event
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="deadline" ref={barRef}>
      <div className="shell deadline__inner">
        <span className="deadline__label">Vendor signup closes in</span>

        <Countdown
          targetMs={targetMs}
          serverNowMs={serverNowMs}
          onExpire={() => setClosed(true)}
        >
          {(r) => (
            <span className="deadline__clock">
              {/* One live region for the whole clock, polite, so a screen
                  reader is not interrupted every single second. */}
              <span className="sr-only" aria-live="polite">
                {r.days} days {r.hours} hours {r.minutes} minutes until vendor signup closes
              </span>
              <span className="deadline__unit" aria-hidden="true">
                <b>{pad(r.days)}</b>
                <span>Days</span>
              </span>
              <span className="deadline__unit" aria-hidden="true">
                <b>{pad(r.hours)}</b>
                <span>Hrs</span>
              </span>
              <span className="deadline__unit" aria-hidden="true">
                <b>{pad(r.minutes)}</b>
                <span>Min</span>
              </span>
              <span className="deadline__unit" aria-hidden="true">
                <b>{pad(r.seconds)}</b>
                <span>Sec</span>
              </span>
            </span>
          )}
        </Countdown>

        <a className="deadline__cta" href="#apply">
          Apply now
        </a>
      </div>
    </div>
  );
}
