'use client';

import { useState } from 'react';
import Countdown, { pad } from './Countdown';

/**
 * Sticky countdown bar, pinned above the nav on the public pages.
 *
 * Counts down to gates opening at the next event by date. The server decides
 * the target instant and hands over its own clock; when the countdown runs out
 * this swaps in place to "gates are open", without a reload, and the next
 * server render moves it on to the following event once the night is over.
 *
 * The vendor signup cutoff is a line under the clock rather than the thing
 * being counted, because it stops meaning anything two days before the event
 * while the event itself is still the reason anyone is on the page. Closing the
 * form for real is enforced on the server regardless of what this shows.
 */
export default function DeadlineBar({
  targetMs,
  serverNowMs,
  eventName,
  eventDate,
  eventTime,
  signupOpen,
  signupClosesDisplay,
  zoneLabel,
  initiallyOpen,
}: {
  targetMs: number;
  serverNowMs: number;
  eventName: string;
  eventDate: string;
  eventTime: string;
  /** Whether vendor signup is still taking applications for this event. */
  signupOpen: boolean;
  signupClosesDisplay: string;
  zoneLabel: string;
  /** True when gates have already opened, so it starts in the open state. */
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);

  // Gates are open, so the countdown has nothing left to count.
  if (open) {
    return (
      <div className="deadline" role="status">
        <div className="shell deadline__inner">
          <span className="deadline__label">We are open</span>
          <span className="deadline__note">
            {eventName} is on now. Gates opened at {eventTime}. Admission is free.
          </span>
          <a className="deadline__cta" href="#visit">
            Directions
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="deadline">
      <div className="shell deadline__inner">
        <span className="deadline__label">
          {eventName}, {eventDate}. Gates open in
        </span>

        <Countdown
          targetMs={targetMs}
          serverNowMs={serverNowMs}
          onExpire={() => setOpen(true)}
        >
          {(r) => (
            <span className="deadline__clock">
              {/* One live region for the whole clock, polite, so a screen
                  reader is not interrupted every single second. */}
              <span className="sr-only" aria-live="polite">
                {r.days} days {r.hours} hours {r.minutes} minutes until gates open
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

        <span className="deadline__note">
          {signupOpen
            ? `Vendor signup closes ${signupClosesDisplay} ${zoneLabel}`
            : 'Vendor signup is closed for this date'}
        </span>

        <a className="deadline__cta" href="#apply">
          {signupOpen ? 'Apply now' : 'Join the waitlist'}
        </a>
      </div>
    </div>
  );
}
