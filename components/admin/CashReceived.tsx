'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * What was actually collected for an offline spot.
 *
 * A prepaid row is stamped paid by the database the instant the vendor submits
 * the form, before anybody has taken a note off them. So "paid" on one of these
 * rows is a claim, and this is where it becomes a fact.
 *
 * Deliberately not on the vendor form. The vendor is not the person who took
 * the money, and asking them to confirm it would record the same assertion in a
 * new place rather than checking it.
 *
 * The amount is free to differ from the fee in either direction. A vendor who
 * handed over $20 for a $25 booth, or $30 because nobody had change, are both
 * ordinary and both need to end up in the books as what happened.
 */
export default function CashReceived({
  id,
  amountCents,
  amountReceivedCents,
  amountReceivedAt,
  settled,
}: {
  id: string;
  /** The booked fee, offered as the starting point since it is usually right. */
  amountCents: number;
  amountReceivedCents: number | null;
  /**
   * When it was counted, already formatted. Empty when nothing is recorded.
   *
   * Its own column rather than paid_at, which the database stamps at
   * submission: a recorded amount without the date it was recorded is half a
   * book-keeping entry.
   */
  amountReceivedAt: string;
  /**
   * Whether the row claims to be paid.
   *
   * An offline row used to be paid by definition, because the database stamped
   * one paid the instant the vendor submitted. That is no longer true: the
   * prepaid path is retired and a row left over from it can be corrected back
   * to unpaid so a payment link can be sent. On such a row the "says paid"
   * explanation below is simply false, and this is what stops it being shown.
   */
  settled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const recorded = amountReceivedCents !== null;
  const [value, setValue] = useState(
    recorded ? (amountReceivedCents / 100).toFixed(2) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(dollars: string) {
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount_received_dollars: dollars }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not record that.');
        return;
      }

      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const expected = (amountCents / 100).toFixed(2);
  const difference = recorded ? amountReceivedCents - amountCents : 0;
  const locked = busy || pending;

  return (
    <div className="cash">
      <p className="cash__head">Cash received</p>

      {recorded ? (
        <>
          <p className="cash__state">
            <b>${(amountReceivedCents / 100).toFixed(2)}</b> recorded against a{' '}
            {`$${expected}`} spot
            {difference === 0 ? null : (
              <span className={difference < 0 ? 'cash__short' : 'cash__over'}>
                {difference < 0
                  ? ` · $${(Math.abs(difference) / 100).toFixed(2)} short`
                  : ` · $${(difference / 100).toFixed(2)} over`}
              </span>
            )}
          </p>
          {/* The date the money was counted, which is the half of a
              book-keeping entry an amount on its own is missing. */}
          {amountReceivedAt ? <p className="cash__when">Counted {amountReceivedAt}</p> : null}
        </>
      ) : (
        <p className="cash__state cash__state--missing">
          {settled
            ? 'Nothing recorded. This row says paid because the database stamps a prepaid signup paid on submission, not because money was counted.'
            : 'Nothing recorded, and this row is not marked paid. If they hand you cash, put it here. If they are paying by card, send them the link above instead.'}
        </p>
      )}

      <div className="cash__entry">
        <label className="cash__field">
          <span className="cash__currency" aria-hidden="true">
            $
          </span>
          <input
            className="input input--sm cash__input"
            value={value}
            disabled={locked}
            inputMode="decimal"
            autoComplete="off"
            maxLength={12}
            placeholder={expected}
            aria-label="Amount received in dollars"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>

        <button
          className="btn btn--sm btn--amber cash__save"
          type="button"
          disabled={locked || !value.trim()}
          onClick={() => void save(value.trim())}
        >
          {locked ? 'Saving…' : recorded ? 'Update' : 'Record'}
        </button>

        {recorded ? (
          <button
            className="btn btn--sm btn--ghost cash__clear"
            type="button"
            disabled={locked}
            onClick={() => {
              setValue('');
              void save('');
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="cash__hint">
        What you actually took, not what the spot costs. Enter it as dollars.
      </p>

      {error ? (
        <p className="cash__error" role="alert">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="cash__ok" role="status">
          Recorded.
        </p>
      ) : null}
    </div>
  );
}
