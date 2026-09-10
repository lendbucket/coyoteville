'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The organization's live page, from the numbers down.
 *
 * This is the page a team shows their parents while the game is on, so the
 * three figures are the largest things on it and they are set in tabular
 * numerals: a total that ticks up while somebody is reading it must not make
 * the line jump.
 *
 * It polls rather than subscribing. Realtime from the browser would mean
 * opening read access on parking_payments to the anon key, and that table is
 * money. A poll goes through a route that checks the token and returns
 * aggregates, so nothing new is exposed and there is one data path to keep
 * honest.
 *
 * The same ten second floor the tracker uses, for the same reason. This page is
 * left open in a cup holder for three hours by however many parents the
 * organization sent the link to, and every one of those tabs is asking the same
 * question. Hidden tabs do not ask at all.
 */

const POLL_MS = 10_000;
const MIN_GAP_MS = 10_000;

export type LedgerLine = {
  id: string;
  time: string;
  amountCents: number;
  label: string;
};

const money = (cents: number) => `${Math.round(cents / 100).toLocaleString('en-US')}`;

/** The rate, as the page says it. Handed in would be a prop nobody varies. */
const FEE_LABEL = '3.25%';

/**
 * The countdown, as whole units down to the minute and seconds in the last
 * hour. Nobody watching a fundraiser needs a millisecond, and a seconds digit
 * that runs all evening is a distraction from the number that matters.
 */
function remaining(ms: number): { label: string; done: boolean } {
  if (ms <= 0) return { label: '', done: true };

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 1) {
    return { label: `${hours}h ${String(minutes).padStart(2, '0')}m`, done: false };
  }

  const seconds = Math.floor((ms % 60_000) / 1000);
  return {
    label: `${minutes}:${String(seconds).padStart(2, '0')}`,
    done: false,
  };
}

export type LiveNumbers = {
  cents: number;
  vehicles: number;
  /**
   * The flat rate on parking. Never the sum of what Square charged.
   *
   * The organization is paid on the rate in their terms, which they can check
   * against a total with a calculator. What Square actually took is in the
   * tracker, for Robert, and the difference either way is Coyoteville's.
   */
  feeCents: number;
  donationCents: number;
  donations: number;
  shareCents: number;
  owedCents: number;
  basis: 'gross' | 'net';
};

export default function FundraiserLive({
  id,
  token,
  endsAtISO,
  initial,
  initialLedger,
  initialPaidAtISO,
  payByLabel,
  feeNote,
  supportEmail,
}: {
  id: string;
  token: string;
  endsAtISO: string;
  initial: LiveNumbers;
  initialLedger: LedgerLine[];
  initialPaidAtISO: string | null;
  payByLabel: string;
  feeNote: string;
  supportEmail: string;
}) {
  const [n, setNumbers] = useState<LiveNumbers>(initial);
  const [ledger, setLedger] = useState<LedgerLine[]>(initialLedger);
  const [paidAtISO, setPaidAtISO] = useState<string | null>(initialPaidAtISO);

  const endsAt = useMemo(() => Date.parse(endsAtISO), [endsAtISO]);
  const [now, setNow] = useState<number | null>(null);

  /* Null until the browser says what time it is. Rendering a countdown from the
     server's clock and then correcting it on hydration would flash a wrong
     number on the one page nobody should have to double check. */
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lastRun = useRef(0);

  useEffect(() => {
    let alive = true;

    async function pull(force = false) {
      if (typeof document !== 'undefined' && document.hidden) return;

      const at = Date.now();
      if (!force && at - lastRun.current < MIN_GAP_MS) return;
      lastRun.current = at;

      try {
        const res = await fetch(
          `/api/fundraiser/live?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;

        const data = (await res.json()) as {
          ok?: boolean;
          numbers?: LiveNumbers;
          paidAtISO?: string | null;
          ledger?: LedgerLine[];
        };

        if (!alive || !data.ok) return;
        if (data.numbers) setNumbers(data.numbers);
        if (Array.isArray(data.ledger)) setLedger(data.ledger);
        setPaidAtISO(data.paidAtISO ?? null);
      } catch {
        /* Keep the last numbers. In a stand on a phone, the figure from ten
           seconds ago is a better answer than an error. */
      }
    }

    const timer = setInterval(() => pull(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', () => pull());

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, token]);

  const countdown = now === null ? null : remaining(endsAt - now);

  return (
    <>
      {/* --------------------------------------------------- the fixed head */}
      <div className="live__head">
      {/* ------------------------------------------------------ countdown */}
      <div className="live__clock">
        {countdown === null ? (
          <p className="live__clock-num live__clock-num--idle">&nbsp;</p>
        ) : countdown.done ? (
          <p className="live__closed">Parking closed. Final numbers below.</p>
        ) : (
          <>
            <p className="live__clock-label">Parking closes in</p>
            <p className="live__clock-num">{countdown.label}</p>
          </>
        )}
      </div>

      {/* --------------------------------------------------- the numbers */}
      <dl className="live__figures">
        <Figure
          label="Parking collected"
          value={money(n.cents)}
          sub={`${n.vehicles} ${n.vehicles === 1 ? 'vehicle' : 'vehicles'}`}
        />

        {/* Shown as a deduction so the arithmetic on the page is followable.
            A flat rate rather than a running sum of settled fees, so the
            number is stable while the night is on and an organization can
            check it against the total themselves. */}
        <Figure label={`Processing fees, ${FEE_LABEL}`} value={`- ${money(n.feeCents)}`} muted />

        <Figure label="Net after fees" value={money(Math.max(0, n.cents - n.feeCents))} />

        <Figure
          label={n.basis === 'net' ? 'Your share, 50% of net' : 'Your share, 50% of gross'}
          value={money(n.shareCents)}
          accent
        />

        <Figure
          label="Gifts to the team, 100%"
          value={money(n.donationCents)}
          sub={`${n.donations} ${n.donations === 1 ? 'gift' : 'gifts'}`}
          accent
        />

        <Figure label="Total coming to you" value={money(n.owedCents)} accent big />

        <Figure
          label={paidAtISO ? 'Paid on' : 'Paid by'}
          value={paidAtISO ? formatPaid(paidAtISO) : payByLabel}
          date
        />
      </dl>

      </div>

      {/* ----------------------------------------------------- the ledger */}
      {/* The one scroll container on the page. Everything above it is fixed,
          so the numbers a team is watching never scroll away, and a flick past
          the end of the list does not rubber band the page behind it. */}
      <section className="live__ledger" aria-labelledby="live-ledger-title">
        {/* Under the numbers, and inside the scroller rather than pinned above
            it. It is prose explaining the figures, not a figure, and pinning it
            cost the ledger its whole height on a 320 by 568 screen. */}
        <p className="live__gross">{feeNote}</p>

        <h2 id="live-ledger-title" className="live__h2">
          Every payment, as it lands
        </h2>

        {ledger.length === 0 ? (
          <p className="live__empty">Nothing yet tonight. This fills in as cars arrive.</p>
        ) : (
          <ol className="live__rows">
            {ledger.map((line) => (
              <li className="live__row" key={line.id}>
                <span className="live__row-time">{line.time}</span>
                <span className="live__row-label">{line.label}</span>
                <span className="live__row-amount">{money(line.amountCents)}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Inside the scroller, so it does not take height from the numbers,
            and a real tap target rather than an inline link in a sentence. */}
        <p className="live__foot">
          Questions about tonight
          <a className="live__mail" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
        </p>
      </section>
    </>
  );
}

/**
 * One figure, as a row rather than a card.
 *
 * Seven of these have to sit above the ledger on a 390 by 844 screen with the
 * countdown, and cards could not: they were 742px for the set. A row is label
 * left, value right, one baseline, about 40px. The total keeps its weight by
 * being larger and accented rather than by being a different shape.
 */
function Figure({
  label,
  value,
  sub,
  accent,
  muted,
  big,
  date,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  muted?: boolean;
  big?: boolean;
  date?: boolean;
}) {
  const classes = [
    'live__figure',
    accent ? 'live__figure--share' : '',
    muted ? 'live__figure--muted' : '',
    big ? 'live__figure--total' : '',
    date ? 'live__figure--date' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <dt>
        {label}
        {sub ? <span className="live__sub">{sub}</span> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatPaid(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'long',
  }).format(new Date(at));
}
