'use client';

import { useId, useMemo, useState } from 'react';
import { SPONSOR_LEVELS, type LevelAvailability } from '@/lib/race-sponsorship';
import {
  SPONSORSHIP,
  SPONSORSHIP_IS_DRAFT,
  SPONSORSHIP_VERSION,
} from '@/lib/race-sponsorship/current';
import { dollars } from '@/lib/race';

/**
 * The sponsorship application.
 *
 * A business form, not a runner form. There is no waiver here because nobody
 * is assuming a risk of injury: somebody is buying placement, and what they
 * need before they pay is the agreement saying what the placement is and by
 * when. So the agreement is on the page, in full, above the button, and
 * accepting it is what paying means.
 *
 * The logo is optional at this step on purpose. A business that wants to
 * commit on a phone at a counter should be able to, and chasing the artwork
 * afterwards is a conversation rather than a blocker. The agreement says the
 * artwork deadline is the same as the shirt deadline, so the cost of leaving it
 * is stated rather than hidden.
 */
export default function SponsorForm({
  raceSlug,
  availability,
  shirtDeadlineLabel,
  shirtDeadlinePassed,
}: {
  raceSlug: string;
  availability: LevelAvailability[];
  shirtDeadlineLabel: string;
  shirtDeadlinePassed: boolean;
}) {
  const uid = useId();

  const open = useMemo(() => availability.filter((a) => !a.soldOut), [availability]);

  const [levelId, setLevelId] = useState(open[0]?.level.id ?? '');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState('');

  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const level = SPONSOR_LEVELS.find((l) => l.id === levelId) ?? null;

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!levelId) out.push('Pick a level.');
    if (!businessName.trim()) out.push('Give us the business name.');
    if (!contactName.trim()) out.push('Give us a contact name.');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) out.push('That email does not look right.');
    if (phone.replace(/\D/g, '').length < 10) out.push('That phone number does not look right.');
    if (!accepted) out.push('Read and accept the agreement.');
    if (!signature.trim()) out.push('Type your name to accept it.');
    return out;
  }, [levelId, businessName, contactName, email, phone, accepted, signature]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (problems.length) {
      setError(problems[0]);
      return;
    }

    setStatus('sending');
    setError(null);

    try {
      /* Multipart, because the logo is a file. The rest would be happier as
         JSON and is not worth two code paths. */
      const form = new FormData();
      form.set('race_slug', raceSlug);
      form.set('level', levelId);
      form.set('business_name', businessName);
      form.set('contact_name', contactName);
      form.set('email', email);
      form.set('phone', phone);
      form.set('website', website);
      form.set('placement_notes', notes);
      form.set('agreement_version', SPONSORSHIP_VERSION);
      form.set('agreement_accepted', 'true');
      form.set('signature_name', signature);
      if (logo) form.set('logo', logo);

      const res = await fetch('/api/race-sponsor', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        checkoutUrl?: string | null;
      };

      if (!res.ok || !data.ok) {
        setStatus('error');
        setError(data.error ?? 'That did not go through. Try again in a minute.');
        return;
      }

      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      window.location.assign('/turkey-trot/sponsors/thanks');
    } catch {
      setStatus('error');
      setError('We could not reach the server. Check your connection and try again.');
    }
  }

  if (!open.length) {
    return (
      <div className="sponsorform sponsorform--shut">
        <h3>Every level is taken</h3>
        <p className="lede">
          All of it has sold. Email us and we will put you first in line for next year, and
          tell you if anything frees up.
        </p>
      </div>
    );
  }

  return (
    <form className="sponsorform" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label className="label" htmlFor={`${uid}-level`}>
          Level <span className="req">*</span>
        </label>
        <select
          className="select"
          id={`${uid}-level`}
          value={levelId}
          onChange={(e) => setLevelId(e.target.value)}
        >
          {open.map(({ level: l, remaining }) => (
            <option key={l.id} value={l.id}>
              {l.name}, {dollars(l.cents)}
              {l.slots > 1 ? ` (${remaining} left)` : ''}
            </option>
          ))}
        </select>
      </div>

      {level ? (
        <ul className="sponsorform__benefits">
          {level.benefits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid2">
        <div className="field">
          <label className="label" htmlFor={`${uid}-biz`}>
            Business name <span className="req">*</span>
          </label>
          <input
            className="input"
            id={`${uid}-biz`}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-contact`}>
            Contact name <span className="req">*</span>
          </label>
          <input
            className="input"
            id={`${uid}-contact`}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label" htmlFor={`${uid}-email`}>
            Email <span className="req">*</span>
          </label>
          <input
            className="input"
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-phone`}>
            Phone <span className="req">*</span>
          </label>
          <input
            className="input"
            id={`${uid}-phone`}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${uid}-web`}>
          Website
        </label>
        <input
          className="input"
          id={`${uid}-web`}
          inputMode="url"
          placeholder="https://"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <span className="hint">Your logo on the race page links here.</span>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${uid}-logo`}>
          Your logo
        </label>
        <input
          className="input"
          id={`${uid}-logo`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
        />
        <span className="hint">
          A PNG with a transparent background is best.{' '}
          {shirtDeadlinePassed
            ? 'The shirt order has already gone to the printer.'
            : `Artwork has to reach us by ${shirtDeadlineLabel} to go on the shirts.`}{' '}
          You can send it later, and we will chase you for it.
        </span>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${uid}-notes`}>
          Anything we should know
        </label>
        <textarea
          className="input"
          id={`${uid}-notes`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* ---------------------------------------------------- the agreement */}
      <fieldset className="racereg__block racereg__waiver">
        <legend>The agreement</legend>

        {SPONSORSHIP_IS_DRAFT ? (
          <p className="formnote formnote--error">
            This agreement is a draft and has not been reviewed by a lawyer yet. It is on the
            page so you can read exactly what you are agreeing to.
          </p>
        ) : null}

        <div className="racereg__waivertext">
          {SPONSORSHIP.map((block, i) => {
            if (block.kind === 'heading') return <h4 key={i}>{block.text}</h4>;
            if (block.kind === 'conspicuous') {
              return (
                <p key={i} className="racereg__conspicuous">
                  {block.text}
                </p>
              );
            }
            if (block.kind === 'list') {
              return (
                <ul key={i}>
                  {(block.items ?? []).map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i}>{block.text}</p>;
          })}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            I have read it, I have the authority to commit this business, and I agree to it.
          </span>
        </label>

        <div className="field">
          <label className="label" htmlFor={`${uid}-sig`}>
            Type your full name to accept <span className="req">*</span>
          </label>
          <input
            className="input"
            id={`${uid}-sig`}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
        </div>

        <p className="hint">Accepting version {SPONSORSHIP_VERSION}.</p>
      </fieldset>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="btn btn--primary btn--lg" type="submit" disabled={status === 'sending'}>
        {status === 'sending'
          ? 'Sending'
          : level
            ? `Sponsor the race, ${dollars(level.cents)}`
            : 'Sponsor the race'}
      </button>
    </form>
  );
}
