'use client';

import Countdown, { pad } from './Countdown';

/**
 * Countdown to gates opening, laid over a photograph. Client side because it
 * ticks; the target instant itself is resolved on the server.
 */
export default function EventCountdown({
  targetMs,
  serverNowMs,
  eventName,
  displayDate,
  displayTime,
  zoneLabel,
}: {
  targetMs: number;
  serverNowMs: number;
  eventName: string;
  displayDate: string;
  displayTime: string;
  zoneLabel: string;
}) {
  return (
    <Countdown targetMs={targetMs} serverNowMs={serverNowMs}>
      {(r) => (
        <>
          <p className="eyebrow">
            {eventName} &middot; {displayDate} &middot; {displayTime} {zoneLabel}
          </p>
          <h2 id="countdown-title">{r.expired ? 'We are open' : 'Gates open in'}</h2>

          {r.expired ? (
            <p className="evt__open">Come on out. {displayDate}, from {displayTime}.</p>
          ) : (
            <div className="evt__clock">
              <span className="sr-only" aria-live="polite">
                {r.days} days {r.hours} hours {r.minutes} minutes until gates open
              </span>
              {[
                { v: r.days, l: 'Days' },
                { v: r.hours, l: 'Hours' },
                { v: r.minutes, l: 'Minutes' },
                { v: r.seconds, l: 'Seconds' },
              ].map((u) => (
                <div className="evt__unit" key={u.l} aria-hidden="true">
                  <b>{pad(u.v)}</b>
                  <span>{u.l}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Countdown>
  );
}
