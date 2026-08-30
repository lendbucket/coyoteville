'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * The recurring spot: where it stands, and the one control that changes it.
 *
 * Cancelling is a two step press. It is not destructive in the sense of losing
 * data, but it does stop a vendor's income arrangement with the lot, and it is
 * sitting in a sheet on a phone that gets used one handed at a gate. One
 * mis-tap should not end somebody's monthly spot.
 *
 * The label says what actually happens rather than the word "cancel" on its
 * own, because the thing worth being sure of is that the vendor keeps the spot
 * to the end of the month they have paid for. Nobody should have to remember
 * that rule; the button should say it.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: 'Not billing yet',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Cancelled',
  paused: 'Paused',
};

export default function SubscriptionControls({
  id,
  businessName,
  status,
  periodEnd,
  canceling,
  monthlyLabel,
  failedPayments,
  approved,
}: {
  id: string;
  businessName: string;
  status: string | null;
  /** Paid through, already formatted. */
  periodEnd: string | null;
  canceling: boolean;
  monthlyLabel: string;
  failedPayments: number;
  /** False while the application is still in the review queue. */
  approved: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const state = status ?? 'pending';
  const label = STATUS_LABELS[state] ?? state;
  const alreadyDone = canceling || state === 'canceled';

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        periodEnd?: string | null;
        note?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? 'That did not go through. Try again.');
        setBusy(false);
        return;
      }

      setResult(
        data.note
          ? data.note
          : data.periodEnd
            ? `Cancelled. They keep the spot until ${data.periodEnd} and will not be charged again.`
            : 'Cancelled. They will not be charged again.'
      );
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subs">
      <p className="subs__hd">
        Monthly spot
        <span className={`badge badge--${state === 'active' ? 'ok' : state === 'past_due' ? 'review' : 'off'}`}>
          {label}
        </span>
      </p>

      <dl className="subs__facts">
        <div>
          <dt>Fee</dt>
          <dd>{monthlyLabel ? `${monthlyLabel} a month` : 'Not set'}</dd>
        </div>
        <div>
          <dt>{canceling ? 'Runs until' : 'Next charge'}</dt>
          <dd>{periodEnd ?? (approved ? 'Waiting on the first invoice' : 'Starts when you approve')}</dd>
        </div>
        {failedPayments > 0 ? (
          <div>
            <dt>Failed charges</dt>
            <dd className="subs__bad">
              {failedPayments} in a row. They have been emailed to fix the card.
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? <p className="review__result">{result}</p> : null}

      {alreadyDone ? (
        <p className="hint">
          {periodEnd
            ? `Cancelled. The spot runs until ${periodEnd} and there are no further charges.`
            : 'Cancelled. There are no further charges.'}
        </p>
      ) : !approved ? (
        <p className="hint">
          Nothing is billing yet. The first charge is taken when you approve this application, and
          the card on file is released if you deny it.
        </p>
      ) : confirming ? (
        <div className="subs__confirm">
          <p>
            Cancel the monthly spot for <b>{businessName}</b>?
          </p>
          <p className="hint">
            This stops the next charge. They keep the spot until{' '}
            {periodEnd ?? 'the end of the month they have paid for'}, and no part month is
            refunded.
          </p>
          <div className="review__row">
            <button
              className="btn btn--rust review__btn"
              type="button"
              disabled={busy}
              onClick={cancel}
            >
              {busy ? 'Cancelling…' : 'Yes, cancel at period end'}
            </button>
            <button
              className="btn btn--ghost review__btn"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn--ghost subs__cancel"
          type="button"
          disabled={refreshing}
          onClick={() => setConfirming(true)}
        >
          Cancel at the end of the paid month
        </button>
      )}
    </div>
  );
}
