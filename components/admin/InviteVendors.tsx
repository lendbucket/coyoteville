'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Summary = {
  sent: number;
  failed: number;
  failures: { name: string; error: string }[];
};

/**
 * The one time invite to past vendors.
 *
 * Two taps, and the count is named in both. "Send to 34 vendors" rather than
 * "Send", because this is thirty four real people's inboxes and the number is
 * the single most important thing to be sure of before it fires. A confirmation
 * that does not say what it is confirming is a confirmation nobody reads.
 *
 * The count is fetched when the panel opens rather than passed down with the
 * page, so it is the number at the moment of sending and not the number when
 * the tracker last rendered.
 *
 * There is no schedule behind this and no follow up. Once a vendor is invited
 * they drop out of the list forever, which is why running it twice is safe and
 * why the button will simply say nobody is left.
 */
export default function InviteVendors() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<'idle' | 'confirm' | 'sending' | 'done'>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = pending || stage === 'sending';

  async function loadCount() {
    setError(null);
    try {
      const res = await fetch('/api/admin/invite-vendors');
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        count?: number;
        names?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not read the vendor list.');
        return;
      }
      setCount(data.count ?? 0);
      setNames(data.names ?? []);
      setStage('confirm');
    } catch {
      setError('Could not reach the server.');
    }
  }

  async function send() {
    setStage('sending');
    setError(null);
    try {
      const res = await fetch('/api/admin/invite-vendors', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        failed?: number;
        failures?: { name: string; error: string }[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || 'The send did not go through.');
        setStage('confirm');
        return;
      }
      setSummary({ sent: data.sent ?? 0, failed: data.failed ?? 0, failures: data.failures ?? [] });
      setStage('done');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Some invites may have gone out.');
      setStage('confirm');
    }
  }

  if (stage === 'done' && summary) {
    return (
      <div className="invite">
        <p className="invite__head">Invites sent</p>
        <p className="invite__state">
          <b>{summary.sent}</b> sent, <b>{summary.failed}</b> failed.
        </p>
        {summary.failures.length ? (
          <ul className="invite__fails">
            {summary.failures.map((f) => (
              <li key={f.name}>
                <b>{f.name}</b>: {f.error}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="invite__hint">
          Anyone invited drops off this list. There is no follow up and nothing is scheduled.
        </p>
      </div>
    );
  }

  return (
    <div className="invite">
      <p className="invite__head">Invite past vendors</p>

      {stage === 'idle' ? (
        <>
          <p className="invite__state">
            Emails every past vendor who has not been invited and has not signed in, once, so they
            can claim the details we already have for them.
          </p>
          <button className="btn btn--sm btn--ghost" type="button" onClick={() => void loadCount()}>
            See who would get it
          </button>
        </>
      ) : null}

      {stage === 'confirm' || stage === 'sending' ? (
        <>
          {count === 0 ? (
            <p className="invite__state">
              Nobody is waiting. Every past vendor has either been invited already or has signed in.
            </p>
          ) : (
            <>
              <p className="invite__state">
                This emails <b>{count}</b> {count === 1 ? 'vendor' : 'vendors'}, one at a time. Each
                one is marked as invited the moment their email goes out, so this cannot send twice.
              </p>
              {names.length ? (
                <p className="invite__names">{names.join(', ')}</p>
              ) : null}
              <button
                className="btn btn--sm btn--amber"
                type="button"
                disabled={busy}
                onClick={() => void send()}
              >
                {stage === 'sending'
                  ? `Sending to ${count}…`
                  : `Send to ${count} ${count === 1 ? 'vendor' : 'vendors'}`}
              </button>{' '}
              <button
                className="btn btn--sm btn--ghost"
                type="button"
                disabled={busy}
                onClick={() => setStage('idle')}
              >
                Cancel
              </button>
            </>
          )}
        </>
      ) : null}

      {error ? (
        <p className="invite__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
