'use client';

import { useRef, useState } from 'react';
import { SITE } from '@/lib/seo';
import { loginErrorMessage } from './login-errors';

/**
 * The tracker sign in card.
 *
 * This is opened from a home screen icon on a phone, so it is built for that
 * first: one card, centred, big enough to hit, and it says which event is
 * current before you are even signed in.
 *
 * It posts by fetch rather than letting the browser submit, for two reasons.
 * A wrong password used to bounce the page to /admin?e=bad, which on a slow
 * connection looked like the app had crashed; now the message lands under the
 * heading and the field keeps focus. And the button can hold a busy state, so
 * a second tap while the password is being checked does nothing instead of
 * firing another request at the rate limiter.
 *
 * The form still carries a real method and action. With JavaScript off the
 * browser posts it the old way and the API redirects back here with ?e=<code>,
 * which arrives as `initialError`.
 */
export default function AdminLogin({
  initialError,
  configured,
}: {
  /** Message from a no-JS round trip, already resolved from the ?e= code. */
  initialError: string | null;
  configured: boolean;
}) {
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function reject(message: string) {
    setError(message);
    setBusy(false);
    // Clear the guess and hand the field back, so the next try is one tap.
    const field = passwordRef.current;
    if (field) {
      field.value = '';
      field.focus();
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    // Read before the first await: currentTarget is cleared once the handler
    // returns, and the await below outlives it.
    const body = new FormData(event.currentTarget);

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (response.ok && data?.ok) {
        /* A full navigation, not a router refresh: the tracker has to be
           rendered by a request that carries the session cookie. The busy
           state is left on deliberately, so the button stays dead for the
           moment the new page takes to arrive. */
        window.location.assign('/admin');
        return;
      }

      reject(loginErrorMessage(data?.error) ?? 'That did not go through. Try again.');
    } catch {
      reject('That did not go through. Check your connection and try again.');
    }
  }

  return (
    <div className="adminlogin__card">
      {logoFailed ? (
        <span className="adminlogin__fallback" aria-hidden="true">
          C
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="adminlogin__logo"
          src={SITE.logoSvg}
          alt={SITE.name}
          width={270}
          height={180}
          onError={() => setLogoFailed(true)}
        />
      )}

      <h1 className="adminlogin__title">Vendor Tracker</h1>
      <p className="adminlogin__where">{SITE.name}, Alice Texas</p>

      {error ? (
        <p className="formnote formnote--error adminlogin__error" id="adminlogin-error" role="alert">
          {error}
        </p>
      ) : null}

      {!configured ? (
        <p className="hint adminlogin__hint">
          Set <code>ADMIN_PASSWORD</code> in the environment and redeploy before signing in.
        </p>
      ) : null}

      <form className="form adminlogin__form" method="POST" action="/api/admin/login" onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="admin-password">
            Password
          </label>
          <input
            className="input adminlogin__input"
            id="admin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus
            ref={passwordRef}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'adminlogin-error' : undefined}
          />
        </div>

        <button className="btn btn--rust adminlogin__submit" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="adminlogin__spinner" aria-hidden="true" />
              Checking…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </div>
  );
}
