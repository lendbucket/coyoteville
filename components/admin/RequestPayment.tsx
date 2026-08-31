'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Send this vendor a Square payment link.
 *
 * For somebody who is in the lot and has never actually been asked for money:
 * the prepaid registration path is gone, so every unpaid row left is a card
 * payment waiting to be requested.
 *
 * Two deliberate absences.
 *
 * It never fires on its own. There is no timer behind it and no follow up
 * scheduled by sending one. Whether to chase a vendor Robert will stand next
 * to in the lot on Friday is a judgement, and the tool does not get to make it.
 *
 * It does not confirm before sending. The action is one email with a link in
 * it, to a vendor who owes money, and the row records when it went out, so a
 * second tap is a duplicate rather than a mistake. What it does instead is show
 * the last send, which is the information that actually stops a double nudge.
 */
export default function RequestPayment({
  id,
  businessName,
  email,
  amountLabel,
  bookingLabel,
  requestedAt,
}: {
  id: string;
  businessName: string;
  email: string;
  /** The fee, already formatted. */
  amountLabel: string;
  /** The event or date, already formatted. */
  bookingLabel: string;
  /** When the last request went out, formatted. Empty when none has. */
  requestedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const locked = busy || pending;

  async function send() {
    setBusy(true);
    setError(null);
    setSent(false);

    try {
      const res = await fetch('/api/admin/request-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not send that.');
        return;
      }

      setSent(true);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="askpay">
      <p className="askpay__head">Payment not received</p>

      <p className="askpay__state">
        {businessName} owes <b>{amountLabel}</b> for {bookingLabel}. This creates a Square link
        for that amount and emails it to {email}.
      </p>

      <button
        className="btn btn--amber askpay__send"
        type="button"
        disabled={locked}
        onClick={() => void send()}
      >
        {locked ? 'Sending…' : requestedAt ? 'Send the link again' : 'Request payment'}
      </button>

      {/* The last send, which is what stops a second nudge going out because
          nobody remembered the first one. */}
      {requestedAt ? <p className="askpay__when">Last requested {requestedAt}</p> : null}

      {error ? (
        <p className="askpay__error" role="alert">
          {error}
        </p>
      ) : null}
      {sent && !error ? (
        <p className="askpay__ok" role="status">
          Sent to {email}.
        </p>
      ) : null}
    </div>
  );
}
