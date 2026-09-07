'use client';

import { useMemo, useState } from 'react';
import type { WaiverBlock } from '@/lib/volunteer-waiver/current';
import { isAdultOn } from '@/lib/volunteer';

/**
 * The waiver, signed on a phone at the lot.
 *
 * Designed for the actual moment: somebody standing on gravel at dusk, holding
 * a phone in one hand, with people behind them waiting to sign. That rules a
 * lot out. No account, no email required, no upload, no multi step wizard, and
 * every input at 16px so iOS does not zoom the page the instant a field is
 * focused and leave them pinching to find the next one.
 *
 * The guardian block appears from the date of birth rather than from a
 * question. Asking somebody to declare they are 18 gets the answer that makes
 * the form shorter. Computing it from a date they have no reason to lie about,
 * against the date of the game rather than today, gets the true one. The server
 * computes it again from the same function and stores its own answer, so this
 * is only deciding what to show.
 */
export default function VolunteerWaiverForm({
  waiver,
  waiverVersion,
  isDraft,
  eventSlug,
  eventName,
  eventDate,
  eventDay,
  orgId,
  orgName,
  supportEmail,
}: {
  waiver: WaiverBlock[];
  waiverVersion: string;
  isDraft: boolean;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  /** The event's calendar date, YYYY-MM-DD, which age is measured against. */
  eventDay: string;
  orgId: string | null;
  orgName: string | null;
  supportEmail: string;
}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dob, setDob] = useState('');
  const [signed, setSigned] = useState<{ name: string; isAdult: boolean } | null>(null);

  /* Null until the date is complete and real, which is most of the time
     somebody is typing it. Null shows neither block: guessing and then
     retracting the guardian fields mid keystroke is worse than waiting. */
  const adult = useMemo(() => (dob ? isAdultOn(dob, eventDay) : null), [dob, eventDay]);
  const minor = adult === false;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setError(null);

    try {
      const body = new FormData(e.currentTarget);
      const res = await fetch('/api/volunteer-waiver', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        isAdult?: boolean;
      };

      if (!res.ok || !data.ok) {
        setError(data.error || 'That did not go through. Try again.');
        setStatus('idle');
        return;
      }

      setSigned({
        name: String(body.get('full_name') ?? ''),
        isAdult: Boolean(data.isAdult),
      });
      setStatus('done');
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      setError('Could not reach the server. Check your signal and try again.');
      setStatus('idle');
    }
  }

  /* The confirmation. Deliberately plain and deliberately large: its whole job
     is to be held up and read at arm's length by somebody standing in a lot at
     night, so it says the name, the night, and the organization, and nothing
     else competes with them. */
  if (status === 'done' && signed) {
    return (
      <div className="vol__done" role="status">
        <p className="vol__done-tick" aria-hidden="true">
          Signed
        </p>
        <h2 className="vol__done-name">{signed.name}</h2>
        <p className="vol__done-line">{eventName}</p>
        <p className="vol__done-line">{eventDate}</p>
        {orgName ? <p className="vol__done-org">with {orgName}</p> : null}
        <p className="vol__done-kind">
          {signed.isAdult
            ? 'Signed as an adult volunteer.'
            : 'Signed by a parent or guardian. A parent or guardian stays on site for the whole shift.'}
        </p>
        <p className="hint">Show this to Coyoteville staff. Waiver version {waiverVersion}.</p>
      </div>
    );
  }

  return (
    <form className="form vol__form" onSubmit={submit}>
      <input type="hidden" name="event_slug" value={eventSlug} />
      {orgId ? <input type="hidden" name="org_application_id" value={orgId} /> : null}

      <div className="field">
        <label className="label" htmlFor="vol-name">
          Your full name <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vol-name"
          name="full_name"
          required
          maxLength={160}
          autoComplete="name"
          autoCapitalize="words"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="vol-phone">
          Phone <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vol-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="vol-dob">
          Date of birth <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vol-dob"
          name="date_of_birth"
          type="date"
          required
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          autoComplete="bday"
        />
        <span className="hint">
          This is how we know whether a parent or guardian needs to sign. We do not ask you to
          declare it.
        </span>
      </div>

      {minor ? (
        <div className="vol__minor">
          <p className="vol__minor-head">Under 18 on the night of this game</p>
          <p className="vol__minor-loud">
            A parent or guardian signs this form and stays on site for the whole shift. You will not
            direct traffic or stand in a traffic lane at any time.
          </p>

          <div className="field">
            <label className="label" htmlFor="vol-gname">
              Parent or guardian name <span className="req">*</span>
            </label>
            <input
              className="input"
              id="vol-gname"
              name="guardian_name"
              required
              maxLength={160}
              autoCapitalize="words"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="vol-gphone">
              Parent or guardian phone <span className="req">*</span>
            </label>
            <input
              className="input"
              id="vol-gphone"
              name="guardian_phone"
              type="tel"
              inputMode="tel"
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="vol-gsig">
              Parent or guardian, type your full name to sign <span className="req">*</span>
            </label>
            <input
              className="input sig-input"
              id="vol-gsig"
              name="guardian_signature_name"
              required
              maxLength={160}
              autoCapitalize="words"
            />
          </div>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="vol-em-name">
          Emergency contact name <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vol-em-name"
          name="emergency_contact_name"
          required
          maxLength={160}
          autoCapitalize="words"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="vol-em-phone">
          Emergency contact phone <span className="req">*</span>
        </label>
        <input
          className="input"
          id="vol-em-phone"
          name="emergency_contact_phone"
          type="tel"
          inputMode="tel"
          required
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="vol-email">
          Email
        </label>
        <input
          className="input"
          id="vol-email"
          name="email"
          type="email"
          inputMode="email"
          maxLength={180}
          placeholder="Optional"
          autoComplete="email"
        />
        <span className="hint">Optional. We do not send you anything.</span>
      </div>

      {/* The waiver, in a scrollable block, the same treatment the vendor
          agreement and the program terms get. Conspicuous sections are marked
          so the parts that give up a legal right cannot be skimmed past, which
          is what the Texas fair notice doctrine is about. */}
      <div className="field">
        <span className="label">The waiver</span>
        {isDraft ? (
          <p className="vol__draft" role="note">
            This text is a draft and has not been reviewed by a lawyer yet.
          </p>
        ) : null}
        <div className="terms" tabIndex={0} aria-label="Volunteer waiver">
          {waiver.map((block, i) => {
            if (block.kind === 'heading') {
              return (
                <h3 key={i} className="terms__h">
                  {block.text}
                </h3>
              );
            }
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
        <span className="hint">Version {waiverVersion}</span>
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" name="waiver_accepted" value="true" required />
          <span>
            I have read this waiver and I agree to it. <span className="req">*</span>
          </span>
        </label>
      </div>

      <div className="field">
        <label className="label" htmlFor="vol-sig">
          {minor ? 'Volunteer, type your full name' : 'Type your full name to sign'}{' '}
          <span className="req">*</span>
        </label>
        <input
          className="input sig-input"
          id="vol-sig"
          name="signature_name"
          required
          maxLength={160}
          autoComplete="name"
          autoCapitalize="words"
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

      <button className="btn btn--amber vol__submit" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Signing...' : 'Sign and start work'}
      </button>

      <p className="hint">
        Something wrong with this form, find Coyoteville staff or email{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </form>
  );
}
