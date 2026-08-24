'use client';

import { useState } from 'react';
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

  if (closed) {
    return (
      <div className="deadline deadline--closed" role="status">
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
    <div className="deadline">
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
