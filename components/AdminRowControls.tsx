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
  const [busy, setBusy] = useState(false);

  async function save(patch: { approval_status?: string; spot_number?: string }) {
    setBusy(true);
    setSaved('idle');

    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });

      if (!res.ok) throw new Error('save failed');

      setSaved('ok');
      startTransition(() => router.refresh());
    } catch {
      setSaved('error');
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
            setStatus(next);
            save({ approval_status: next });
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
            if ((spotNumber ?? '') !== spot.trim()) save({ spot_number: spot.trim() });
          }}
        />
      </label>

      <span className="arow__saved" role="status">
        {busy || pending ? 'Saving…' : saved === 'ok' ? 'Saved' : saved === 'error' ? 'Failed' : ''}
      </span>
    </div>
  );
}
