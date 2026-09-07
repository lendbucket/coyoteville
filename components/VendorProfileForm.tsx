'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
/* Duplicated rather than imported, the same way VendorForm duplicates them and
   for the same reason: lib/uploads is server-only, because it holds the storage
   client. Kept in step with ACCEPT_ATTRIBUTE, ALLOWED_LABEL and MAX_PHOTOS
   there; the server re-validates every file regardless, so a drift here costs a
   confusing message rather than a bad upload. */
const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';
const ALLOWED_LABEL = 'JPG, PNG, WEBP, HEIC or PDF';
const MAX_PHOTOS = 3;

export type ProfileView = {
  email: string;
  business_name: string;
  contact_name: string;
  phone: string;
  sells: string;
  serves_food: boolean;
  hasLogo: boolean;
  photoCount: number;
  hasPermit: boolean;
  permitExpiresAt: string;
  /** Already worked out on the server, with the reason if it cannot be reused. */
  permitProblem: string | null;
};

/**
 * Edit a saved vendor profile.
 *
 * Files are shown as "on file" with the option to replace, never as a preview:
 * a permit is a private document and a signed URL for one has no business
 * sitting in a page that might be left open on a phone on a table.
 *
 * The permit expiry is a required field whenever a permit is being uploaded.
 * That is the one piece of this profile that goes stale on its own, and a
 * stored permit with no expiry is one nobody can vouch for.
 */
export default function VendorProfileForm({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacePermit, setReplacePermit] = useState(!profile.hasPermit);

  const locked = busy || pending;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'POST',
        body: new FormData(e.currentTarget),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not save that.');
        return;
      }
      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form vprofile__form" onSubmit={save}>
      <div className="field">
        <span className="label">Email</span>
        <p className="fieldnote">{profile.email}</p>
        <p className="hint">
          This is how you sign in, so it cannot be changed here. Email us if it needs to move.
        </p>
      </div>

      <div className="form__row">
        <div className="field">
          <label className="label" htmlFor="vp-business">
            Business name <span className="req">*</span>
          </label>
          <input
            className="input"
            id="vp-business"
            name="business_name"
            required
            maxLength={120}
            defaultValue={profile.business_name}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="vp-contact">
            Contact name <span className="req">*</span>
          </label>
          <input
            className="input"
            id="vp-contact"
            name="contact_name"
            required
            maxLength={120}
            defaultValue={profile.contact_name}
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="vp-phone">
          Phone <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vp-phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          defaultValue={profile.phone}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="vp-sells">
          What you sell <span className="req">*</span>
        </label>
        <textarea
          className="input"
          id="vp-sells"
          name="sells"
          required
          rows={3}
          maxLength={300}
          defaultValue={profile.sells}
        />
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" name="serves_food" value="true" defaultChecked={profile.serves_food} />
          <span>I serve food</span>
        </label>
        <p className="hint">Anyone serving food needs a current health permit on file.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="vp-logo">
          Logo
        </label>
        <p className="fieldnote">{profile.hasLogo ? 'One on file.' : 'None on file.'}</p>
        <input className="input" id="vp-logo" name="logo" type="file" accept={ACCEPT_ATTRIBUTE} />
        <p className="hint">{ALLOWED_LABEL}. Leave empty to keep the one on file.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="vp-photos">
          Photos
        </label>
        <p className="fieldnote">
          {profile.photoCount ? `${profile.photoCount} on file.` : 'None on file.'}
        </p>
        <input
          className="input"
          id="vp-photos"
          name="photos"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
        />
        <p className="hint">Up to {MAX_PHOTOS}. Choosing new ones replaces the set.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="vp-permit">
          Texas DSHS health permit
        </label>

        {profile.hasPermit ? (
          <p className="fieldnote">
            One on file
            {profile.permitExpiresAt ? `, expires ${profile.permitExpiresAt}` : ', expiry unknown'}.
          </p>
        ) : (
          <p className="fieldnote">None on file.</p>
        )}

        {profile.permitProblem ? (
          <p className="formnote formnote--warn" role="note">
            {profile.permitProblem}
          </p>
        ) : null}

        {profile.hasPermit && !replacePermit ? (
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => setReplacePermit(true)}
          >
            Replace it
          </button>
        ) : (
          <>
            <input
              className="input"
              id="vp-permit"
              name="permit"
              type="file"
              accept={ACCEPT_ATTRIBUTE}
            />
            <label className="label" htmlFor="vp-permit-exp">
              Expiry date on the permit
            </label>
            <input
              className="input"
              id="vp-permit-exp"
              name="permit_expires_at"
              type="date"
              defaultValue={profile.permitExpiresAt}
            />
            <p className="hint">
              Required with a new permit. We will not offer a permit for reuse without a date we
              can check against the event.
            </p>
          </>
        )}
      </div>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="formnote" role="status">
          Saved.
        </p>
      ) : null}

      <button className="btn btn--amber" type="submit" disabled={locked}>
        {locked ? 'Saving…' : 'Save my details'}
      </button>
    </form>
  );
}
