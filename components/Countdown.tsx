'use client';

import { useEffect, useState } from 'react';
import { splitRemaining, type Remaining } from '@/lib/time';

/**
 * Ticking countdown to a fixed UTC instant.
 *
 * The target is resolved from a wall clock time and an IANA zone on the server
 * (see lib/time.ts), so it is the same instant for everybody. The remaining
 * time is then measured against the server's clock rather than the browser's:
 * `serverNow` is stamped at render, we work out how far the device clock is
 * from it once on mount, and apply that offset every tick. A visitor whose
 * laptop is set to the wrong day still sees the right number.
 *
 * Until mount we render the server's own figures, so there is no flash of
 * zeroes and no hydration mismatch.
 */
export type CountdownProps = {
  /** Target instant, epoch milliseconds. */
  targetMs: number;
  /** Server clock at render, epoch milliseconds. */
  serverNowMs: number;
  children: (remaining: Remaining) => React.ReactNode;
  /** Called once when the countdown reaches zero while on screen. */
  onExpire?: () => void;
};

export default function Countdown({
  targetMs,
  serverNowMs,
  children,
  onExpire,
}: CountdownProps) {
  const [remaining, setRemaining] = useState<Remaining>(() =>
    splitRemaining(targetMs - serverNowMs)
  );

  useEffect(() => {
    // How far this device's clock sits from the server's. Seeded from the
    // timestamp rendered into the page, then refined below.
    let skew = Date.now() - serverNowMs;
    let fired = false;
    let cancelled = false;

    const tick = () => {
      const next = splitRemaining(targetMs - (Date.now() - skew));
      setRemaining(next);

      if (next.expired && !fired) {
        fired = true;
        onExpire?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);

    // Pages are statically rendered and revalidated on an interval, so the
    // baked timestamp can be a little stale. Ask the server directly, and
    // discount the round trip so the reading is not biased by latency.
    const sentAt = Date.now();
    fetch('/api/now', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { now?: number } | null) => {
        if (cancelled || typeof data?.now !== 'number') return;
        const roundTrip = Date.now() - sentAt;
        skew = Date.now() - (data.now + roundTrip / 2);
        tick();
      })
      .catch(() => {
        // Offline or blocked. The seeded skew is still serviceable.
      });

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [targetMs, serverNowMs, onExpire]);

  return <>{children(remaining)}</>;
}

/** Two digit unit, so the row does not jump width as numbers change. */
export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
