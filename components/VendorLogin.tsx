'use client';

import { useState } from 'react';

/**
 * Ask for an email, send a magic link.
 *
 * No password field, because there is no password. These are people on a phone
 * between setting up a canopy and opening, and the fastest sign in is the one
 * with nothing to remember.
 *
 * The confirmation never says whether an account exists. The route answers the
 * same way either way, and so does this, because "no account for that address"
 * is a way to find out who sells at Coyoteville.
 */
export default function VendorLogin({
  initialError,
  initialEmail,
}: {
  initialError?: string;
  /** Prefilled from the invite link, so claiming is a tap and then a tap. */
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === 'expired'
      ? 'That link had already been used or had run out. Ask for a fresh one.'
      : initialError
        ? 'That link did not work. Ask for a fresh one.'
        : null
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/vendor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'That did not go through. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="vlogin__done">
        <h2>Check your email</h2>
        <p className="muted">
          If we have you on file, a sign in link is on its way to {email}. It works for an hour and
          can be used once.
        </p>
        <p className="muted">
          Nothing arrived? Check the junk folder, then ask again in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <form className="form vlogin__form" onSubmit={send}>
      <div className="field">
        <label className="label" htmlFor="vendor-email">
          Your email <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vendor-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <p className="hint">
          The address you used when you applied. We send a link, there is no password.
        </p>
      </div>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="btn btn--amber" type="submit" disabled={busy || !email.trim()}>
        {busy ? 'Sending…' : 'Email me a sign in link'}
      </button>
    </form>
  );
}
