'use client';

import { useState } from 'react';
import type { TermsBlock } from '@/lib/fundraiser-terms';

/* Kept in step with lib/uploads, which is server-only because it holds the
   storage client. The server re-validates every file regardless. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

export type GameOption = { slug: string; label: string; taken: boolean };

/**
 * The organization application.
 *
 * Mirrors the vendor form's shape on purpose: the fields, then the terms in a
 * scrollable block, then a typed signature. An organization is committing to
 * bring people to a place on a night and to forfeit its share if it does not,
 * which is the same kind of promise a vendor makes and deserves the same
 * treatment rather than a checkbox at the bottom of a contact form.
 */
export default function OrgApplicationForm({
  terms,
  termsVersion,
  games,
  volunteerMinimum,
  programName,
  supportEmail,
}: {
  terms: TermsBlock[];
  termsVersion: string;
  games: GameOption[];
  volunteerMinimum: number;
  programName: string;
  supportEmail: string;
}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const openGames = games.filter((g) => !g.taken);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setError(null);

    try {
      const res = await fetch('/api/org-application', {
        method: 'POST',
        body: new FormData(e.currentTarget),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'That did not go through. Try again.');
        setStatus('idle');
        return;
      }
      setStatus('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Could not reach the server. Check your signal and try again.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <div className="fnf__done">
        <h2>We have your application</h2>
        <p className="lede">
          Check your email for a copy of what you signed up for. One organization is drawn for each
          game, and we will let you know either way.
        </p>
        <p className="hint">
          Questions in the meantime, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </p>
      </div>
    );
  }

  /* Two different empty states, because they mean opposite things and saying
     the wrong one is worse than saying nothing. Every game taken is good news
     about a busy season. No games at all means the schedule is not up, or the
     events table could not be read, and telling somebody their season is full
     when it has not been announced would be simply false. */
  if (!games.length) {
    return (
      <div className="fnf__done">
        <h2>Dates are not up yet</h2>
        <p className="lede">
          The home game schedule for the next season goes up here as soon as it is set. Email{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will tell you the moment it
          is.
        </p>
      </div>
    );
  }

  if (!openGames.length) {
    return (
      <div className="fnf__done">
        <h2>Every game is spoken for</h2>
        <p className="lede">
          All of this season&apos;s home games have an organization. Email{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will put you first in line
          when the next season goes up.
        </p>
      </div>
    );
  }

  return (
    <form className="form fnf__form" onSubmit={submit}>
      <div className="form__row">
        <div className="field">
          <label className="label" htmlFor="org-name">
            Organization name <span className="req">*</span>
          </label>
          <input className="input" id="org-name" name="org_name" required maxLength={160} />
        </div>
        <div className="field">
          <label className="label" htmlFor="org-type">
            What kind of organization <span className="req">*</span>
          </label>
          <select className="select" id="org-type" name="org_type" required defaultValue="">
            <option value="" disabled>
              Pick one
            </option>
            <option>School or school group</option>
            <option>Booster club</option>
            <option>Sports team</option>
            <option>Church or faith group</option>
            <option>Youth organization</option>
            <option>Nonprofit</option>
            <option>Civic or service club</option>
            <option>Other community group</option>
          </select>
        </div>
      </div>

      <div className="form__row">
        <div className="field">
          <label className="label" htmlFor="org-contact">
            Contact name <span className="req">*</span>
          </label>
          <input className="input" id="org-contact" name="contact_name" required maxLength={120} />
        </div>
        <div className="field">
          <label className="label" htmlFor="org-phone">
            Phone <span className="req">*</span>
          </label>
          <input className="input" id="org-phone" name="phone" type="tel" inputMode="tel" required />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="org-email">
          Email <span className="req">*</span>
        </label>
        <input className="input" id="org-email" name="email" type="email" inputMode="email" required />
      </div>

      <div className="form__row">
        <div className="field">
          <label className="label" htmlFor="org-volunteers">
            Adults you can bring <span className="req">*</span>
          </label>
          <input
            className="input"
            id="org-volunteers"
            name="volunteer_count"
            type="number"
            inputMode="numeric"
            min={volunteerMinimum}
            max={200}
            required
            defaultValue={volunteerMinimum}
          />
          <span className="hint">
            {volunteerMinimum} is the minimum. Adults only, aged 18 or over.
          </span>
        </div>
        <div className="field">
          <label className="label" htmlFor="org-ein">
            EIN
          </label>
          <input className="input" id="org-ein" name="ein" maxLength={20} placeholder="Optional" />
          <span className="hint">Only if you have one. It is not required.</span>
        </div>
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" name="is_501c3" value="true" />
          <span>We are a registered 501(c)(3)</span>
        </label>
        <span className="hint">
          Not required. Booster clubs, teams, church groups and clubs are all welcome.
        </span>
      </div>

      <div className="field">
        <label className="label" htmlFor="org-story">
          What would the money do for you <span className="req">*</span>
        </label>
        <textarea
          className="input"
          id="org-story"
          name="story"
          rows={4}
          required
          minLength={10}
          maxLength={1200}
        />
        <span className="hint">A few sentences is plenty.</span>
      </div>

      <div className="field">
        <label className="label" htmlFor="org-logo">
          Your logo
        </label>
        <input className="file" id="org-logo" name="logo" type="file" accept={ACCEPT} />
        <span className="hint">Optional. We use it when we announce who is working the game.</span>
      </div>

      <fieldset className="field fnf__games">
        <legend className="label">
          Which games can you work <span className="req">*</span>
        </legend>
        <span className="hint">
          Pick every one you could cover. You are only ever drawn for a game you picked.
        </span>
        {games.map((g) => (
          <label className="check" key={g.slug}>
            <input type="checkbox" name="event_slugs" value={g.slug} disabled={g.taken} />
            <span>
              {g.label}
              {g.taken ? <span className="fnf__taken"> already spoken for</span> : null}
            </span>
          </label>
        ))}
      </fieldset>

      {/* The terms, in a scrollable block, the same treatment the vendor
          agreement gets. Conspicuous sections are visually marked so the parts
          that decide money and obligation cannot be skimmed past. */}
      <div className="field">
        <span className="label">Program terms</span>
        <div className="terms" tabIndex={0} aria-label="Program terms">
          {terms.map((block, i) => {
            if (block.kind === 'heading') return <h3 key={i} className="terms__h">{block.text}</h3>;
            if (block.kind === 'conspicuous') {
              return (
                <p key={i} className="terms__loud">
                  {block.text}
                </p>
              );
            }
            if (block.kind === 'list') {
              return (
                <ul key={i} className="terms__list">
                  {(block.items ?? []).map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i}>{block.text}</p>;
          })}
        </div>
        <span className="hint">Version {termsVersion}</span>
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" name="terms_accepted" value="true" required />
          <span>
            I have read the {programName} terms and I am authorized to accept them for this
            organization. <span className="req">*</span>
          </span>
        </label>
      </div>

      <div className="field">
        <label className="label" htmlFor="org-signature">
          Type your full name to sign <span className="req">*</span>
        </label>
        <input
          className="input sig-input"
          id="org-signature"
          name="signature_name"
          required
          maxLength={120}
          autoComplete="name"
        />
        <span className="hint">
          Typing your name is your signature under the Texas Uniform Electronic Transactions Act.
        </span>
      </div>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="btn btn--amber" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Apply to work a game'}
      </button>
    </form>
  );
}
