'use client';

import Countdown, { pad } from '@/components/Countdown';

/**
 * The countdown to the gun, in the hero.
 *
 * Wraps the Countdown already used on the home and fundraiser pages rather than
 * being a second one. That component resolves the remaining time against the
 * server's clock rather than the device's, so a visitor whose laptop is set to
 * the wrong day still sees the right number, and it renders the server's own
 * figures until mount so there is no flash of zeroes.
 *
 * Only the presentation here is new, and this is the only JavaScript the design
 * pass adds.
 */
export default function RaceCountdown({
  targetMs,
  serverNowMs,
}: {
  targetMs: number;
  serverNowMs: number;
}) {
  return (
    <Countdown targetMs={targetMs} serverNowMs={serverNowMs}>
      {(r) =>
        r.expired ? (
          <p className="racehero__gone">The gun has gone. See you next year.</p>
        ) : (
          <div className="racehero__clock">
            <span className="sr-only" aria-live="polite">
              {r.days} days {r.hours} hours {r.minutes} minutes until the start
            </span>
            {[
              { v: r.days, l: 'Days' },
              { v: r.hours, l: 'Hrs' },
              { v: r.minutes, l: 'Min' },
              { v: r.seconds, l: 'Sec' },
            ].map((u) => (
              <div className="racehero__unit" key={u.l} aria-hidden="true">
                <b>{pad(u.v)}</b>
                <span>{u.l}</span>
              </div>
            ))}
          </div>
        )
      }
    </Countdown>
  );
}
