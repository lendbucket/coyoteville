'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchesGateQuery, type GatePayment, type GateSnapshot } from '@/lib/gate-match';

/**
 * Did this person pay?
 *
 * Asked at a gate, on a phone, by somebody with a car waiting and a driver
 * holding up a receipt. Everything here follows from that.
 *
 * The search is local. The whole window is fetched once and kept, so typing
 * four digits never touches the network: on stadium signal a request per
 * keystroke is a request that fails at the exact moment it is needed. The copy
 * is written to localStorage too, so the panel still answers after a reload
 * with no signal at all, and it always says how old its copy is rather than
 * letting stale look live.
 *
 * Two answers, never merged. Square says whether the money was taken; our own
 * table says whether we recorded it. A payment Square has and we do not is a
 * real payment with a late webhook, which is the case this was built for, and
 * it reads as "they paid, we have not recorded it yet" rather than as a miss.
 */

const CACHE_KEY = 'coyoteville.gate.v1';
const REFRESH_MS = 30_000;

type Cached = { snapshot: GateSnapshot; fetchedAt: number };

function readCache(): Cached | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed?.snapshot?.payments) return null;
    return parsed;
  } catch {
    /* A private window, cleared data, or a shape from an older build. Starting
       empty is correct and the fetch below fills it. */
    return null;
  }
}

function writeCache(snapshot: GateSnapshot): void {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ snapshot, fetchedAt: Date.now() } satisfies Cached)
    );
  } catch {
    /* Out of quota or blocked. The in memory copy still works for this view. */
  }
}

function money(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function clockOf(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return new Date(at).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function agoOf(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

export default function GateLookup() {
  const [query, setQuery] = useState('');
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  /* Re-renders the staleness line without refetching, so "2 minutes ago" does
     not sit there saying "just now" for an hour. */
  const [, setTick] = useState(0);

  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/gate', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as GateSnapshot;
      if (!mounted.current) return;
      if (!data.ok) throw new Error('not ok');

      setSnapshot(data);
      setFetchedAt(Date.now());
      setOffline(false);
      writeCache(data);
    } catch {
      /* Keep whatever is on screen. A gate lookup that blanks itself when the
         signal drops is worse than one that says how old its answer is. */
      if (mounted.current) setOffline(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    const cached = readCache();
    if (cached) {
      setSnapshot(cached.snapshot);
      setFetchedAt(cached.fetchedAt);
    }

    void refresh();

    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const clock = window.setInterval(() => setTick((n) => n + 1), 20_000);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const digits = query.replace(/\D/g, '');

  const results = useMemo(() => {
    const all = snapshot?.payments ?? [];
    if (digits.length < 3) return [];
    return all.filter((p) => matchesGateQuery(p, digits)).slice(0, 12);
  }, [snapshot, digits]);

  const recent: GatePayment[] = useMemo(
    () => (snapshot?.payments ?? []).slice(0, 8),
    [snapshot]
  );

  const showing = digits.length >= 3 ? results : recent;

  return (
    <section className="gate" aria-label="Gate lookup">
      <div className="gate__head">
        <p className="gate__title">Did they pay</p>
        <p className="gate__age">
          {fetchedAt === null
            ? 'Loading'
            : `${offline ? 'No signal. Showing a copy from ' : 'Updated '}${agoOf(fetchedAt)}`}
          {loading ? ', checking' : ''}
        </p>
      </div>

      <input
        className="input gate__input"
        type="search"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Last 4 of the card, or receipt number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search by last four of the card or the Square receipt number"
      />

      {snapshot && !snapshot.squareReachable ? (
        <p className="gate__warn">
          Square could not be reached when this copy was taken, so card digits are missing.
          What we recorded is still listed below by time and amount.
        </p>
      ) : null}

      {digits.length > 0 && digits.length < 3 ? (
        <p className="gate__hint">Keep typing. Three digits or more.</p>
      ) : null}

      {digits.length >= 3 && showing.length === 0 ? (
        <p className="gate__none">
          Nothing matches {digits} in the last {snapshot?.windowMinutes ?? 120} minutes.
          {offline ? ' This copy is old, so check again when you have signal.' : ''}
        </p>
      ) : null}

      <ul className="gate__list">
        {showing.map((p) => (
          <li key={p.id} className={`gate__row ${p.recorded ? 'is-recorded' : 'is-pending'}`}>
            <span className="gate__amount">{money(p.amountCents)}</span>
            <span className="gate__meta">
              <b>
                {p.last4 ? `Card ${p.last4}` : 'No card digits'}
                {p.cardBrand ? ` ${p.cardBrand.toLowerCase()}` : ''}
              </b>
              <i>
                {clockOf(p.at)}
                {p.receiptNumber ? `, receipt ${p.receiptNumber}` : ''}
                {p.kind === 'donation' ? ', gift' : ''}
              </i>
            </span>
            <span className="gate__state">
              {p.recorded ? 'Paid and recorded' : 'Paid, not recorded yet'}
            </span>
          </li>
        ))}
      </ul>

      {digits.length < 3 ? (
        <p className="gate__hint">
          The last {snapshot?.payments.length ?? 0} payments in the past{' '}
          {snapshot?.windowMinutes ?? 120} minutes. Type to search.
        </p>
      ) : null}
    </section>
  );
}
