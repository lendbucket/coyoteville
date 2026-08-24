'use client';

import { useId, useState } from 'react';

export default function EmailCapture() {
  const uid = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [note, setNote] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === 'sending') return;

    setState('sending');
    setNote('');

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setState('error');
        setNote(data.error || 'That did not go through. Try again in a minute.');
        return;
      }

      setState('ok');
      setNote('You are on the list. We will email you before the next event.');
      setEmail('');
    } catch {
      setState('error');
      setNote('We could not reach the server. Try again in a minute.');
    }
  }

  return (
    <section className="band" aria-labelledby="band-title">
      <div className="shell band__inner">
        <div>
          <h2 id="band-title">Get the next event by email</h2>
          <p style={{ margin: 0, maxWidth: '46ch' }}>
            We send one email before each event with the date and which trucks are coming. That
            is all we use it for.
          </p>
        </div>

        <div>
          <form className="subscribe" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor={`${uid}-email`}>
              Email address
            </label>
            <input
              id={`${uid}-email`}
              type="email"
              name="email"
              required
              maxLength={180}
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'Adding' : 'Sign me up'}
            </button>
          </form>
          <p className="band__status" role="status">
            {note}
          </p>
        </div>
      </div>
    </section>
  );
}
