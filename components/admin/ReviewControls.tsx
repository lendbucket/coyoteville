'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { APPROVAL_LABELS, isApprovalStatus } from '@/lib/approval';

/**
 * Approve or deny one application.
 *
 * The two buttons are deliberately not symmetrical. Approving is one tap,
 * because it is the common case and it is reversible in practice, an approved
 * vendor can still be cancelled. Denying takes money out of the business and
 * sends someone a rejection, so it opens a reason field first and the confirm
 * button stays dead until there is something real in it. That reason is
 * reproduced verbatim in the email, which the label says out loud so nobody
 * types a note to themselves by mistake.
 *
 * Nothing is optimistic here. Both paths refund or email as a side effect, so
 * the UI waits for the server to say what actually happened rather than drawing
 * a decision that might not have landed.
 */
export default function ReviewControls({
  id,
  businessName,
  approvalStatus,
  amountLabel,
  denialReason,
  refundLabel,
  refundError,
}: {
  id: string;
  businessName: string;
  approvalStatus: string;
  /** The fee, already formatted. Empty for a free spot. */
  amountLabel: string;
  denialReason: string | null;
  refundLabel: string;
  refundError: string | null;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const pending = approvalStatus === 'pending';
  const reasonOk = reason.trim().length >= 10;

  async function decide(decision: 'approve' | 'deny') {
    if (busy) return;
    setBusy(decision);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, reason: decision === 'deny' ? reason.trim() : undefined }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        refundedCents?: number;
        refundError?: string | null;
      } | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? 'That did not go through. Try again.');
        setBusy(null);
        return;
      }

      if (decision === 'approve') {
        setResult('Approved. The confirmation email is on its way.');
      } else if (data.refundError) {
        // The denial stands and the spot is free either way, so this reads as
        // a job to finish rather than as a failure of the decision.
        setResult(`Denied and the vendor has been emailed. The refund did not go through: ${data.refundError}`);
      } else if (data.refundedCents) {
        setResult(
          `Denied. $${(data.refundedCents / 100).toFixed(2)} refunded in full and the spot is free.`
        );
      } else {
        setResult('Denied. There was no fee to refund, and the spot is free.');
      }

      setDenying(false);
      setReason('');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------ already decided */

  if (!pending) {
    const label = isApprovalStatus(approvalStatus)
      ? APPROVAL_LABELS[approvalStatus]
      : approvalStatus;

    return (
      <div className="review review--done">
        <p className="review__state">
          <span className={`badge badge--${approvalStatus === 'approved' ? 'ok' : 'off'}`}>{label}</span>
          {refundLabel ? <span className="review__refund">{refundLabel} refunded</span> : null}
        </p>

        {denialReason ? (
          <p className="review__reason">
            <span className="review__reasonlabel">Reason sent to the vendor</span>
            {denialReason}
          </p>
        ) : null}

        {refundError ? (
          <p className="formnote formnote--error review__flag" role="alert">
            <b>Refund still owed.</b> {refundError}
          </p>
        ) : null}

        {result ? <p className="review__result">{result}</p> : null}
      </div>
    );
  }

  /* ------------------------------------------------------- deciding */

  return (
    <div className="review">
      <p className="review__hd">
        Waiting on you
        <span className="review__sub">
          {amountLabel
            ? `${amountLabel} is held and this spot counts against capacity until you decide.`
            : 'This spot counts against capacity until you decide.'}
        </span>
      </p>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? <p className="review__result">{result}</p> : null}

      {denying ? (
        <div className="review__deny">
          <label className="label" htmlFor={`deny-${id}`}>
            Why, in your own words
          </label>
          <textarea
            className="textarea"
            id={`deny-${id}`}
            value={reason}
            maxLength={600}
            rows={4}
            autoFocus
            placeholder="We already have three taco trucks on this date and cannot fit a fourth."
            onChange={(e) => setReason(e.target.value)}
          />
          <span className="hint">
            This goes to {businessName} word for word, above the refund line. Ten characters
            minimum.
          </span>

          <div className="review__row">
            <button
              className="btn btn--rust review__btn"
              type="button"
              disabled={!reasonOk || busy !== null}
              onClick={() => decide('deny')}
            >
              {busy === 'deny'
                ? 'Denying and refunding…'
                : amountLabel
                  ? `Deny and refund ${amountLabel}`
                  : 'Deny this application'}
            </button>
            <button
              className="btn btn--ghost review__btn"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setDenying(false);
                setReason('');
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="review__row">
          <button
            className="btn btn--amber review__btn"
            type="button"
            disabled={busy !== null || refreshing}
            onClick={() => decide('approve')}
          >
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            className="btn btn--ghost review__btn"
            type="button"
            disabled={busy !== null || refreshing}
            onClick={() => setDenying(true)}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
