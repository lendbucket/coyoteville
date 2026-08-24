'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  describeResult,
  readRecents,
  rememberRecipient,
  type SendResult,
} from './AdminSendPhotos';

/**
 * Hand off every vendor's photos for one event in one go.
 *
 * Same panel as the per row version, pointed at the whole event. The files are
 * grouped by business inside the email so the person posting can work down it
 * business by business, and if the whole set will not fit in one message it is
 * split into numbered emails rather than failing.
 *
 * A batch can take a while: every file is downloaded, re-encoded to web size
 * and attached. The button says so instead of looking hung.
 */
export default function AdminSendAllPhotos({
  event,
  vendorCount,
  fileCount,
}: {
  event: string;
  /** Vendors on this event that have at least one logo or photo. */
  vendorCount: number;
  fileCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);

  const listId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const list = readRecents();
    setRecents(list);
    if (!to && list[0]) setTo(list[0]);
    fieldRef.current?.focus();
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
        body: JSON.stringify({ all: true, event, to: to.trim(), note }),
      });
      const data = (await res.json().catch(() => ({}))) as SendResult;

      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not send those photos.');
        return;
      }

      setRecents(rememberRecipient(to.trim()));
      setDone(describeResult(data));
      setNote('');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const ready = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to.trim()) && !busy;

  if (!vendorCount) return null;

  return (
    <div className="sendall">
      <button
        className={`btn btn--sm ${open ? 'btn--ghost' : 'btn--amber'} sendall__toggle`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : `Send all photos (${vendorCount} vendors, ${fileCount} files)`}
      </button>

      {open ? (
        <div className="sendall__panel">
          <p className="sendphotos__lead">
            Sends every logo and photo for this event in one handoff, grouped by business. If it
            will not fit in one email it is split into numbered ones. Permits are never included.
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
                <button key={r} className="sendphotos__recent" type="button" onClick={() => setTo(r)}>
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

          <button className="btn btn--amber sendphotos__send" type="button" disabled={!ready} onClick={send}>
            {busy ? 'Gathering and sending…' : `Send all ${fileCount} files`}
          </button>

          {busy ? (
            <p className="sendphotos__quiet">
              Every file is being downloaded and resized. On a big event this takes a minute.
            </p>
          ) : null}

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
        </div>
      ) : null}
    </div>
  );
}
