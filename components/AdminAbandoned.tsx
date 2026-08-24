'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type AbandonedItem = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  started: string;
  reminderSent: boolean;
};

/**
 * Started but not paid.
 *
 * Sits at the top of the tracker because it is the list that needs acting on,
 * usually by phone, and often from the gate. Numbers are tap to call.
 */
export default function AdminAbandoned({ rows }: { rows: AbandonedItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, 'ok' | string>>({});

  if (rows.length === 0) return null;

  async function remind(id: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/abandoned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setSent((s) => ({ ...s, [id]: data.error || 'Could not send' }));
        return;
      }

      setSent((s) => ({ ...s, [id]: 'ok' }));
      startTransition(() => router.refresh());
    } catch {
      setSent((s) => ({ ...s, [id]: 'Could not send' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="abandoned" aria-labelledby="abandoned-title">
      <h2 id="abandoned-title" className="abandoned__title">
        Started but not paid <span className="abandoned__count">{rows.length}</span>
      </h2>
      <p className="abandoned__note">
        These vendors filled the form and were sent to checkout more than 30 minutes ago and have
        not paid. Their spots are not held.
      </p>

      <ul className="abandoned__list">
        {rows.map((r) => {
          const state = sent[r.id];
          const already = r.reminderSent || state === 'ok';

          return (
            <li className="abandoned__row" key={r.id}>
              <div className="abandoned__who">
                <b>{r.business_name}</b>
                <span>
                  {r.contact_name} &middot; {r.spot_type} &middot; started {r.started}
                </span>
              </div>

              <div className="abandoned__actions">
                <a className="btn btn--ghost btn--sm" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                  Call {r.phone}
                </a>

                <button
                  className="btn btn--amber btn--sm"
                  type="button"
                  disabled={already || busy === r.id || pending}
                  onClick={() => remind(r.id)}
                >
                  {busy === r.id
                    ? 'Sending…'
                    : already
                      ? 'Reminder sent'
                      : 'Send reminder'}
                </button>
              </div>

              {state && state !== 'ok' ? (
                <p className="abandoned__error" role="alert">
                  {state}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
