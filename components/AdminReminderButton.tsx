'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Send payment reminder.
 *
 * Emails the vendor their original Square payment link. Re-sending is allowed
 * on purpose, but the button carries the time of the last one so it is a
 * deliberate choice rather than an accident.
 *
 * Sized for one handed use at the gate: the button is a 44px target and the
 * label says what it will do before it is pressed.
 */
export default function AdminReminderButton({
  id,
  lastReminderAt,
  canRemind = true,
  compact = false,
}: {
  id: string;
  /** ISO of the most recent reminder, or null if none has gone out. */
  lastReminderAt: string | null;
  /** False when there is no Square payment link to resend. */
  canRemind?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(lastReminderAt);
  const [error, setError] = useState<string | null>(null);

  const already = Boolean(sentAt);

  function when(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  async function send() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/abandoned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        lastReminderAt?: string | null;
      };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not send that reminder.');
        return;
      }

      setSentAt(data.lastReminderAt ?? new Date().toISOString());
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (!canRemind) {
    return <span className="remind__none">No payment link to resend</span>;
  }

  return (
    <span className="remind">
      <button
        className={`btn btn--sm ${already ? 'btn--ghost' : 'btn--amber'}`}
        type="button"
        disabled={busy || pending}
        onClick={send}
      >
        {busy
          ? 'Sending…'
          : already
            ? 'Send reminder again'
            : compact
              ? 'Send payment reminder'
              : 'Send payment reminder'}
      </button>

      {already && !busy ? (
        <span className="remind__sent">Last sent {when(sentAt as string)}</span>
      ) : null}

      {error ? (
        <span className="remind__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
