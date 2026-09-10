'use client';

import { useEffect, useState } from 'react';

/**
 * The running total, on the QR page.
 *
 * The only client component on /park, and it does one thing: replace a number
 * that was rendered on the server with a fresher one every fifteen seconds.
 * Everything else on that page is static HTML, because the page is opened by a
 * driver on a phone on one bar of signal with a car behind them.
 *
 * It starts from a server rendered figure rather than from zero or a spinner.
 * A page that flashes "$0 raised" before correcting itself would be telling the
 * one lie that matters here, and the ISR figure is at most a minute old.
 *
 * The poll stops when the tab is hidden. A phone left in a cup holder for three
 * hours should not be asking the database for a number nobody is reading.
 */
export default function ParkingTotal({
  initialCents,
  orgName,
}: {
  initialCents: number;
  orgName: string | null;
}) {
  const [cents, setCents] = useState(initialCents);

  useEffect(() => {
    let alive = true;

    async function pull() {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/parking/total', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { cents?: number };
        if (alive && typeof data.cents === 'number') setCents(data.cents);
      } catch {
        /* A failed poll keeps the number it had. On a bad connection that is
           the right answer: the last known total, not an error a driver has to
           interpret. */
      }
    }

    const timer = setInterval(pull, 15_000);
    document.addEventListener('visibilitychange', pull);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', pull);
    };
  }, []);

  const amount = `$${Math.round(cents / 100).toLocaleString('en-US')}`;

  return (
    <p className="park__raised" aria-live="polite">
      <b>{amount}</b> raised so far{orgName ? ` for the team` : ' tonight'}
    </p>
  );
}
