'use client';

import { useState } from 'react';

/**
 * The one tap offer, after an anonymous application has already gone through.
 *
 * Offered rather than assumed. The application is complete either way and
 * nothing here can undo it, which is why this sits after the confirmation
 * instead of anywhere in the form: a vendor should never be deciding about an
 * account while they are trying to book a spot.
 *
 * It creates or fills the profile from the row that was just written, then
 * sends the magic link. Until that link is clicked the profile holds details
 * but nobody can sign in to it, which is the same state the backfilled profiles
 * are already in.
 */
export default function SaveDetailsOffer({ applicationId }: { applicationId: string }) {
  const [state, setState] = useState<'offer' | 'busy' | 'sent'>('offer');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') {
    return (
      <div className="shell savedetails">
        <p className="formnote" role="status">
          Saved. Check your email for a link to open your details. Next time you apply, the form is
          already filled in and your files are already there.
        </p>
      </div>
    );
  }

  async function save() {
    setState('busy');
    setError(null);
    try {
      const res = await fetch('/api/vendor/save-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: applicationId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'That did not go through.');
        setState('offer');
        return;
      }

      // The profile exists; now prove the address so they can open it.
      await fetch('/api/vendor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: (data as { email?: string }).email, firstTime: true }),
      }).catch(() => {});

      setState('sent');
    } catch {
      setError('Could not reach the server. Try again.');
      setState('offer');
    }
  }

  return (
    <div className="shell savedetails">
      <p className="savedetails__lead">
        <b>Save your details so you never upload this again.</b> Your logo, photos and permit stay
        on file, and the next application is a form that is already filled in.
      </p>
      <p className="hint">
        Your signature is not saved. You sign the agreement fresh every time, which is what makes
        it a signature. Your permit still has to be current on the day.
      </p>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="btn btn--amber"
        type="button"
        disabled={state === 'busy'}
        onClick={() => void save()}
      >
        {state === 'busy' ? 'Saving…' : 'Save my details'}
      </button>
    </div>
  );
}
