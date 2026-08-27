'use client';

import { useState } from 'react';

/**
 * The offer button on one waitlist row.
 *
 * Client only because it posts and then has to say what happened. The row
 * itself is server rendered; only this control is interactive, so the list
 * stays cheap however long it gets.
 *
 * Offering is not undoable from here on purpose. The email is already gone by
 * the time the button changes, and a button that implied otherwise would be
 * lying. Reverting a status is a Supabase edit.
 */
export default function AdminWaitlistRow({
  id,
  businessName,
  alreadyOffered,
}: {
  id: string;
  businessName: string;
  alreadyOffered: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    alreadyOffered ? 'sent' : 'idle'
  );
  const [message, setMessage] = useState('');

  async function offer() {
    if (status === 'sending') return;

    // Irreversible and outward facing: it emails a real vendor an invitation.
    const ok = window.confirm(
      `Email ${businessName} to offer them a spot?\n\nThey get a link to register and pay. This cannot be taken back.`
    );
    if (!ok) return;

    setStatus('sending');
    setMessage('');

    try {
      const response = await fetch('/api/admin/waitlist-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; warning?: string };

      if (!response.ok || !data.ok) {
        setStatus('error');
        setMessage(data.error ?? 'That did not send.');
        return;
      }

      setStatus('sent');
      setMessage(data.warning ?? '');
    } catch {
      setStatus('error');
      setMessage('That did not send. Check your connection.');
    }
  }

  return (
    <div className="wl__action">
      <button
        className={`btn btn--sm ${status === 'sent' ? 'btn--ghost' : 'btn--amber'}`}
        type="button"
        onClick={offer}
        disabled={status === 'sending' || status === 'sent'}
      >
        {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Offered' : 'Offer a spot'}
      </button>

      {message ? (
        <p className={`wl__msg ${status === 'error' ? 'wl__msg--error' : ''}`} role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
