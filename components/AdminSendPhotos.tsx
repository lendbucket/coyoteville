'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

/**
 * Send a vendor's logo and photos to whoever is writing the social post.
 *
 * The address field is free text on purpose. Whoever is doing the posting
 * changes, so there is no allowed list, only a memory of the last few
 * addresses used so the same one is not retyped every time. That memory is a
 * datalist, which suggests without ever constraining what can be typed.
 *
 * Sized for a phone. Every target is at least 44px, the field is 16px so iOS
 * does not zoom the page on focus, and the panel opens in place rather than in
 * a dialog that has to be dismissed one handed.
 */

const RECENTS_KEY = 'cv_admin_photo_recipients';
const MAX_RECENTS = 5;

export function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch {
    // Private windows and blocked site data both throw here. A missing memory
    // is a small inconvenience; a crashed tracker at the gate is not.
    return [];
  }
}

export function rememberRecipient(email: string): string[] {
  const next = [email, ...readRecents().filter((e) => e.toLowerCase() !== email.toLowerCase())].slice(
    0,
    MAX_RECENTS
  );
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* nothing to do, the send already worked */
  }
  return next;
}

export type SendResult = {
  ok?: boolean;
  error?: string;
  to?: string;
  parts?: number;
  totalParts?: number;
  vendors?: number;
  files?: number;
  downscaled?: boolean;
};

export function describeResult(d: SendResult): string {
  const files = `${d.files ?? 0} file${d.files === 1 ? '' : 's'}`;
  const across =
    (d.vendors ?? 1) > 1 ? ` from ${d.vendors} businesses` : '';
  const split = (d.totalParts ?? 1) > 1 ? ` in ${d.parts} emails` : '';
  const sized = d.downscaled ? ', resized to web size' : '';
  return `Sent ${files}${across}${split} to ${d.to}${sized}.`;
}

export function whenLocal(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default function AdminSendPhotos({
  id,
  businessName,
  fileCount,
  lastSend,
}: {
  id: string;
  businessName: string;
  /** How many logo and photo files this row has. */
  fileCount: number;
  lastSend: { to: string; at: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [sent, setSent] = useState(lastSend);

  const listId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const list = readRecents();
    setRecents(list);
    if (!to && list[0]) setTo(list[0]);
    fieldRef.current?.focus();
    // Only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send() {
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const res = await fetch('/api/admin/send-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, to: to.trim(), note }),
      });
      const data = (await res.json().catch(() => ({}))) as SendResult;

      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not send those photos.');
        return;
      }

      setRecents(rememberRecipient(to.trim()));
      setDone(describeResult(data));
      setSent({ to: to.trim(), at: new Date().toISOString() });
      setNote('');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const ready = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to.trim()) && !busy;

  return (
    <div className="sendphotos">
      <button
        className={`btn btn--sm ${open ? 'btn--ghost' : 'btn--amber'} sendphotos__toggle`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : `Send photos (${fileCount})`}
      </button>

      {sent && !open ? (
        <span className="sendphotos__last">
          Last sent to {sent.to} on {whenLocal(sent.at)}
        </span>
      ) : null}

      {open ? (
        <div className="sendphotos__panel">
          <p className="sendphotos__lead">
            Sends the logo and photos for <b>{businessName}</b> as attachments. Permits are never
            included.
          </p>

          <label className="field">
            <span className="label">Send to</span>
            <input
              ref={fieldRef}
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              list={listId}
              value={to}
              placeholder="name@example.com"
              onChange={(e) => setTo(e.target.value)}
            />
            <datalist id={listId}>
              {recents.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>

          {recents.length ? (
            <div className="sendphotos__recents">
              {recents.map((r) => (
                <button
                  key={r}
                  className="sendphotos__recent"
                  type="button"
                  onClick={() => setTo(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null}

          <label className="field">
            <span className="label">Note (optional)</span>
            <textarea
              className="input sendphotos__note"
              rows={3}
              value={note}
              maxLength={2000}
              placeholder="Anything she should know before posting."
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <button
            className="btn btn--amber sendphotos__send"
            type="button"
            disabled={!ready}
            onClick={send}
          >
            {busy ? 'Sending…' : 'Send photos'}
          </button>

          {error ? (
            <p className="sendphotos__error" role="alert">
              {error}
            </p>
          ) : null}
          {done ? (
            <p className="sendphotos__done" role="status">
              {done}
            </p>
          ) : null}
          {pending ? <span className="sendphotos__quiet">Refreshing…</span> : null}
        </div>
      ) : null}
    </div>
  );
}
