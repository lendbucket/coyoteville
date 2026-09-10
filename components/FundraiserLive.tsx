'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * The organization's night, as a scoreboard.
 *
 * This is held up in a stand and shown to parents. It was a table of seven
 * figures, which is what somebody who already understands the deal wants and is
 * not what a parent standing at a rail wants: they want one number, big enough
 * to read from a row back, and the reassurance that it is still moving.
 *
 * So the money the organization is owed is the page, and everything that
 * produces it is a receipt one tap down. The transparency is not reduced, it is
 * ranked: the arithmetic stays complete and it sits below the fold, because
 * nobody audits a processing fee to be pleased their kid's team made four
 * hundred dollars.
 *
 * It polls every ten seconds. Realtime from the browser would mean opening read
 * access on parking_payments to the anon key, and that table is money.
 *
 * The same ten second floor the tracker uses. This page is left open in a cup
 * holder for three hours by however many parents the link reached, and every one
 * of those tabs asks the same question. Hidden tabs do not ask at all.
 */

const POLL_MS = 10_000;
const MIN_GAP_MS = 10_000;

/** How long a row that just arrived keeps its highlight. */
const ARRIVAL_MS = 2200;

export type LedgerLine = {
  id: string;
  time: string;
  amountCents: number;
  label: string;
};

export type LiveNumbers = {
  cents: number;
  vehicles: number;
  feeCents: number;
  donationCents: number;
  donations: number;
  shareCents: number;
  owedCents: number;
  basis: 'gross' | 'net';
};

/**
 * Every amount on this page, always with cents.
 *
 * "$0.00" and never "0", "$470.00" and never "$470". A page showing somebody
 * money they are owed should not print a bare integer that could be a count,
 * and a zero rendered "0" reads as a bug rather than as nothing having happened
 * yet.
 *
 * Absolute before formatting, so a rounding artefact can never produce
 * "-$0.00". Nothing here is ever negative: the fee is a deduction and its label
 * says so rather than a minus sign saying it.
 */
function money(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.abs(Math.round(cents)) : 0;
  return `$${(safe / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Counts are counts. No cents, no dollar sign. */
function count(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

type Phase = 'before' | 'during' | 'after';

function phaseOf(now: number, startsAt: number, endsAt: number): Phase {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return 'during';
  if (now < startsAt) return 'before';
  if (now >= endsAt) return 'after';
  return 'during';
}

/**
 * Hours, minutes and seconds, always all three.
 *
 * A fixed shape rather than one that drops the hours when they run out, so the
 * block does not change width as it counts and the eye does not have to find
 * the seconds again. Tabular figures do the rest.
 */
function clockParts(ms: number): { h: string; m: string; s: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: String(Math.floor(total / 3600)).padStart(2, '0'),
    m: String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
    s: String(total % 60).padStart(2, '0'),
  };
}

function progress(now: number, startsAt: number, endsAt: number): number {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return 0;
  return Math.min(1, Math.max(0, (now - startsAt) / (endsAt - startsAt)));
}

function formatDate(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'long',
  }).format(new Date(at));
}

export default function FundraiserLive({
  id,
  token,
  orgName,
  startsAtISO,
  endsAtISO,
  openTime,
  initial,
  initialLedger,
  initialPaidAtISO,
  payByLabel,
  feeNote,
  supportEmail,
}: {
  id: string;
  token: string;
  orgName: string;
  startsAtISO: string;
  endsAtISO: string;
  openTime: string;
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
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());

  /**
   * The receipt: shut on a phone, open where there is room.
   *
   * Decided after mount rather than in CSS, because a details element cannot be
   * opened by a stylesheet and the server has no idea how wide the screen is.
   * It starts shut, which is the safe default: a phone gets the right thing on
   * first paint and a desktop opens it a frame later, rather than every phone
   * flashing the whole receipt and collapsing it.
   */
  const [calcOpen, setCalcOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (window.matchMedia('(min-width: 900px)').matches) setCalcOpen(true);
  }, []);

  const startsAt = useMemo(() => Date.parse(startsAtISO), [startsAtISO]);
  const endsAt = useMemo(() => Date.parse(endsAtISO), [endsAtISO]);

  /* Null until the browser says what time it is. Rendering a countdown from the
     server's clock and correcting it on hydration would flash a wrong number on
     the one page nobody should have to double check. */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const phase = now === null ? null : phaseOf(now, startsAt, endsAt);
  const live = phase === 'during';
  const closed = phase === 'after';

  /* ------------------------------------------------------------ the poll */

  const lastRun = useRef(0);
  const feedRef = useRef<HTMLOListElement | null>(null);
  /* Recorded before a list update so the reader's place can be held across one
     that grew at the top. See the layout effect below. */
  const beforeUpdate = useRef<{ top: number; height: number } | null>(null);
  const seen = useRef<Set<string>>(new Set(initialLedger.map((l) => l.id)));

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
        setPaidAtISO(data.paidAtISO ?? null);

        if (Array.isArray(data.ledger)) {
          const fresh = data.ledger.filter((line) => !seen.current.has(line.id));

          const el = feedRef.current;
          if (el) beforeUpdate.current = { top: el.scrollTop, height: el.scrollHeight };

          setLedger(data.ledger);

          if (fresh.length) {
            for (const line of fresh) seen.current.add(line.id);
            setArrived(new Set(fresh.map((l) => l.id)));
            window.setTimeout(() => {
              if (alive) setArrived(new Set());
            }, ARRIVAL_MS);
          }
        }
      } catch {
        /* Keep the last numbers. In a stand on a phone, the figure from ten
           seconds ago is a better answer than an error. */
      }
    }

    const timer = setInterval(() => pull(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
    };
    const onFocus = () => pull();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [id, token]);

  /**
   * Hold the reader's place when the feed grows at the top.
   *
   * Rows arrive newest first, so every new payment pushes what somebody is
   * reading further down. Leaving scrollTop alone would drag the list out from
   * under their thumb every ten seconds. Somebody parked at the very top is
   * left there, because at the top the new row is the thing they want to see.
   */
  useLayoutEffect(() => {
    const el = feedRef.current;
    const before = beforeUpdate.current;
    beforeUpdate.current = null;
    if (!el || !before || before.top <= 0) return;

    const grew = el.scrollHeight - before.height;
    if (grew > 0) el.scrollTop = before.top + grew;
  }, [ledger]);

  /* ---------------------------------------------------------- the render */

  const subline = (() => {
    if (paidAtISO) return `Paid on ${formatDate(paidAtISO)}`;
    if (phase === 'before') {
      return `Parking opens at ${openTime}. Numbers appear here as cars come through.`;
    }
    /* "Paid by" would read as past tense on a total nobody has paid yet. This
       is the night's final number and a promise about when it arrives. */
    if (closed) return `Final. We send this by ${payByLabel}.`;
    return `${count(n.vehicles)} ${n.vehicles === 1 ? 'vehicle' : 'vehicles'} and ${count(
      n.donations
    )} ${n.donations === 1 ? 'gift' : 'gifts'} so far`;
  })();

  return (
    <>
      <div className="live__head">
        {/* ------------------------------------------------ the hero number */}
        <p className="live__heroLabel">
          Coming to {orgName}
          {live ? <span className="live__dot" role="img" aria-label="Live" /> : null}
        </p>
        <p className="live__hero">{money(n.owedCents)}</p>
        <p className="live__heroSub">{subline}</p>

        {/* --------------------------------------------------- the countdown */}
        <div className="live__clock">
          {phase === null ? (
            /* Rendered and hidden rather than absent, so the block keeps its
               height and nothing below it jumps when the clock arrives. */
            <p className="live__clockNum live__clockNum--idle" aria-hidden="true">
              <span>00</span>
              <i>:</i>
              <span>00</span>
              <i>:</i>
              <span>00</span>
            </p>
          ) : closed ? (
            <p className="live__closed">Parking closed</p>
          ) : (
            <>
              <p className="live__clockLabel">
                {phase === 'before' ? 'Parking opens in' : 'Parking closes in'}
              </p>
              <Clock ms={(phase === 'before' ? startsAt : endsAt) - (now ?? 0)} />
            </>
          )}

          {/* The night, as a bar. Only while it is running: before it starts a
              bar at zero reads as progress toward nothing, and after it ends a
              full one says nothing the words above it do not. */}
          {live && now !== null ? (
            <div
              className="live__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress(now, startsAt, endsAt) * 100)}
              aria-label="How far through the night"
            >
              <span style={{ width: `${progress(now, startsAt, endsAt) * 100}%` }} />
            </div>
          ) : null}
        </div>

        {/* -------------------------------------------------- the two inputs */}
        <div className="live__tiles">
          <div className="live__tile">
            <p className="live__tileLabel">Parking collected</p>
            <p className="live__tileValue">{money(n.cents)}</p>
            <p className="live__tileSub">
              {count(n.vehicles)} {n.vehicles === 1 ? 'vehicle' : 'vehicles'}
            </p>
          </div>
          <div className="live__tile">
            <p className="live__tileLabel">Gifts</p>
            <p className="live__tileValue">{money(n.donationCents)}</p>
            <p className="live__tileSub">
              {count(n.donations)} {n.donations === 1 ? 'gift' : 'gifts'}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- the scroller */}
      <div className="live__scroll">
        {/* The receipt. Complete, and one tap down: the arithmetic is the
            promise being kept rather than the thing a parent came to read.
            Open by default on a wide screen, where it costs nothing. */}
        <details
          className="live__calc"
          open={calcOpen}
          onToggle={(e) => setCalcOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="live__calcHead">How it is calculated</summary>

          <dl className="live__calcRows">
            <Row label="Parking collected" value={money(n.cents)} />
            <Row label="Processing fees, 3.25%" value={money(n.feeCents)} muted />
            <Row label="Net after fees" value={money(Math.max(0, n.cents - n.feeCents))} />
            <Row
              label={n.basis === 'net' ? 'Your share, 50% of net' : 'Your share, 50% of gross'}
              value={money(n.shareCents)}
            />
            <Row label="Gifts to the team, 100%" value={money(n.donationCents)} />
            <Row label="Total coming to you" value={money(n.owedCents)} total />
            <Row
              label={paidAtISO ? 'Paid on' : 'Paid by'}
              value={paidAtISO ? formatDate(paidAtISO) : payByLabel}
              date
            />
          </dl>

          <p className="live__note">{feeNote}</p>
        </details>

        {/* ------------------------------------------------------- the feed */}
        <h2 className="live__feedHead">Every payment, as it lands</h2>

        {ledger.length === 0 ? (
          <p className="live__empty">Nothing yet. The first car starts the count.</p>
        ) : (
          <ol className="live__feed" ref={feedRef}>
            {ledger.map((line) => (
              <li className={`live__row${arrived.has(line.id) ? ' is-new' : ''}`} key={line.id}>
                <span className="live__rowTime">{line.time}</span>
                <span className="live__rowWhat">
                  {money(line.amountCents)} {line.label}
                </span>
              </li>
            ))}
          </ol>
        )}

        <p className="live__foot">
          Questions about tonight
          <a className="live__mail" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
        </p>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- pieces */

/**
 * The clock. Each unit in its own box so the seconds keep their size.
 *
 * Under ten minutes the seconds are the number somebody is watching, and the
 * usual treatment of setting them smaller than the hours hides exactly the
 * digit that starts to matter at the moment it starts to matter.
 */
function Clock({ ms }: { ms: number }) {
  const { h, m, s } = clockParts(ms);
  return (
    <p className="live__clockNum">
      <span>{h}</span>
      <i>:</i>
      <span>{m}</span>
      <i>:</i>
      <span>{s}</span>
    </p>
  );
}

function Row({
  label,
  value,
  muted,
  total,
  date,
}: {
  label: string;
  value: string;
  muted?: boolean;
  total?: boolean;
  date?: boolean;
}) {
  const cls = [
    'live__calcRow',
    muted ? 'live__calcRow--muted' : '',
    total ? 'live__calcRow--total' : '',
    date ? 'live__calcRow--date' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
