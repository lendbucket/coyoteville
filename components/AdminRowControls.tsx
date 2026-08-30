'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Inline approve and spot number for one application.
 *
 * Saves optimistically against the API and then refreshes the server component
 * so the counts at the top stay honest. Built to be used one handed at the gate,
 * so the controls are large and there is no modal to dismiss.
 */
export default function AdminRowControls({
  id,
  approvalStatus,
  spotNumber,
}: {
  id: string;
  approvalStatus: string;
  spotNumber: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(approvalStatus);
  const [spot, setSpot] = useState(spotNumber ?? '');
  const [saved, setSaved] = useState<'idle' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
    * Save one field, rolling the control back if it does not land.
    *
    * The select and the input update before the request finishes, which is
    * right for a tool used one handed at a gate. What was wrong was leaving
    * them on the new value when the save failed: the row then showed a
    * decision the database never took, and the only sign was the word
    * "Failed". The previous value is captured here and put back, and the
    * server's own message is shown rather than a generic one.
    */
  async function save(
    patch: { approval_status?: string; spot_number?: string },
    rollback: () => void
  ) {
    setBusy(true);
    setSaved('idle');
    setError(null);

    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        rollback();
        setSaved('error');
        setError(data?.error ?? `That did not save (${res.status}).`);
        return;
      }

      setSaved('ok');
      startTransition(() => router.refresh());
    } catch {
      rollback();
      setSaved('error');
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arow__controls">
      <label className="arow__ctl">
        <span className="arow__ctllabel">Approval</span>
        <select
          className="select select--sm"
          value={status}
          disabled={busy || pending}
          onChange={(e) => {
            const next = e.target.value;
            const previous = status;
            setStatus(next);
            save({ approval_status: next }, () => setStatus(previous));
          }}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="waitlist">Waitlist</option>
          <option value="denied">Denied</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      <label className="arow__ctl">
        <span className="arow__ctllabel">Spot number</span>
        <input
          className="input input--sm"
          value={spot}
          disabled={busy || pending}
          inputMode="numeric"
          maxLength={20}
          placeholder="B-12"
          onChange={(e) => setSpot(e.target.value)}
          onBlur={() => {
            const next = spot.trim();
            const previous = spot;
            if ((spotNumber ?? '') !== next) {
              save({ spot_number: next }, () => setSpot(spotNumber ?? previous));
            }
          }}
        />
      </label>

      <span className="arow__saved" role="status">
        {busy || pending ? 'Saving…' : saved === 'ok' ? 'Saved' : ''}
      </span>

      {error ? (
        <p className="arow__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
