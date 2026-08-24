'use client';

import { useEffect, useId, useState } from 'react';
import Waiver, { WAIVER_VERSION } from './Waiver';
import StringLights from './StringLights';
import { EVENTS, PRICING, SITE } from '@/lib/seo';

type Status = 'idle' | 'sending' | 'error' | 'done';

export default function VendorForm() {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [spot, setSpot] = useState<'booth' | 'truck' | 'free'>('booth');
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [permitsConfirmed, setPermitsConfirmed] = useState(false);
  const [signature, setSignature] = useState('');

  // Filled on the client so the server render and the client render agree.
  const [signedISO, setSignedISO] = useState('');
  const [signedDisplay, setSignedDisplay] = useState('');

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setSignedISO(`${y}-${m}-${d}`);
    setSignedDisplay(
      now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    );
  }, []);

  const fee =
    spot === 'truck' ? PRICING.truck.price : spot === 'booth' ? PRICING.booth.price : 'Free';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    setStatus('sending');
    setMessage('');

    const form = new FormData(e.currentTarget);
    const payload = {
      business_name: String(form.get('business_name') || '').trim(),
      contact_name: String(form.get('contact_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      email: String(form.get('email') || '').trim(),
      spot_type: String(form.get('spot_type') || ''),
      event_slug: String(form.get('event_slug') || ''),
      sells: String(form.get('sells') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
      waiver_accepted: waiverAccepted,
      permits_confirmed: permitsConfirmed,
      signature_name: signature.trim(),
      signed_date: signedISO,
      waiver_version: WAIVER_VERSION,
    };

    try {
      const res = await fetch('/api/vendor-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        checkoutUrl?: string | null;
      };

      if (!res.ok || !data.ok) {
        setStatus('error');
        setMessage(data.error || 'Something went wrong on our end. Try again in a minute.');
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setStatus('done');
      setMessage(
        'You are on the list. We got your application and your signed waiver. Watch your email for the spot number.'
      );
    } catch {
      setStatus('error');
      setMessage('We could not reach the server. Check your connection and try again.');
    }
  }

  if (status === 'done') {
    return (
      <section className="section apply" id="apply" aria-labelledby="apply-title">
        <StringLights tone="dark" variant="top" swags={5} sag={30} id="apply-lights-done" />
        <div className="shell">
          <p className="eyebrow">Vendor application</p>
          <h2 id="apply-title">You are in</h2>
          <p className="lede">{message}</p>
          <p className="hint">
            Questions in the meantime, email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="section apply" id="apply" aria-labelledby="apply-title">
      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={6} id="apply-lights" />

      <div className="shell">
        <p className="eyebrow">Vendor application</p>
        <h2 id="apply-title">Get your spot</h2>
        <p className="lede muted">
          Fill this out, read the waiver, sign it and pay. That is the whole process. Booths are{' '}
          {PRICING.booth.price}, truck spots are {PRICING.truck.price}, and Coyote groups,
          booster clubs and nonprofits are free.
        </p>

        <form className="form" onSubmit={onSubmit} noValidate={false}>
          <div className="form__row">
            <div className="field">
              <label className="label" htmlFor={`${uid}-business`}>
                Business name <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-business`}
                name="business_name"
                type="text"
                required
                maxLength={120}
                autoComplete="organization"
                placeholder="Coyote Kitchen"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-contact`}>
                Contact name <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-contact`}
                name="contact_name"
                type="text"
                required
                maxLength={120}
                autoComplete="name"
                placeholder="Who we call"
              />
            </div>
          </div>

          <div className="form__row">
            <div className="field">
              <label className="label" htmlFor={`${uid}-phone`}>
                Phone <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-phone`}
                name="phone"
                type="tel"
                required
                maxLength={32}
                autoComplete="tel"
                placeholder="361 555 0134"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-email`}>
                Email <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-email`}
                name="email"
                type="email"
                required
                maxLength={180}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="form__row">
            <div className="field">
              <label className="label" htmlFor={`${uid}-spot`}>
                Spot type <span className="req">*</span>
              </label>
              <select
                className="select"
                id={`${uid}-spot`}
                name="spot_type"
                required
                value={spot}
                onChange={(e) => setSpot(e.target.value as 'booth' | 'truck' | 'free')}
              >
                <option value="booth">{PRICING.booth.label}, {PRICING.booth.price}</option>
                <option value="truck">{PRICING.truck.label}, {PRICING.truck.price}</option>
                <option value="free">{PRICING.free.label}, free</option>
              </select>
              <span className="hint">Your fee: {fee}</span>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-event`}>
                Which event <span className="req">*</span>
              </label>
              <select className="select" id={`${uid}-event`} name="event_slug" required defaultValue={EVENTS[0].slug}>
                {EVENTS.map((event) => (
                  <option key={event.slug} value={event.slug}>
                    {event.name}, {event.displayDate}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor={`${uid}-sells`}>
              What do you sell <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-sells`}
              name="sells"
              type="text"
              required
              maxLength={300}
              placeholder="Brisket tacos, aguas frescas"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor={`${uid}-notes`}>
              Anything we should know
            </label>
            <textarea
              className="textarea"
              id={`${uid}-notes`}
              name="notes"
              maxLength={2000}
              placeholder="Trailer length, where you would like to be, anything else."
            />
          </div>

          {/* ------------------------------------------------ waiver */}

          <div className="field">
            <span className="label">Vendor waiver, read it all</span>
            <div
              className="waiver-box"
              tabIndex={0}
              role="region"
              aria-label="Coyoteville vendor waiver"
            >
              <Waiver />
            </div>
            <span className="hint">
              Version {WAIVER_VERSION}. This exact version gets saved with your signature.
            </span>
          </div>

          <label className="check">
            <input
              type="checkbox"
              name="waiver_accepted"
              checked={waiverAccepted}
              onChange={(e) => setWaiverAccepted(e.target.checked)}
              required
            />
            <span>
              I have read the Coyoteville vendor waiver above and I agree to all of it, including
              the release, the indemnification and the assumption of risk.{' '}
              <span className="req">*</span>
            </span>
          </label>

          <label className="check">
            <input
              type="checkbox"
              name="permits_confirmed"
              checked={permitsConfirmed}
              onChange={(e) => setPermitsConfirmed(e.target.checked)}
              required
            />
            <span>
              I carry my own permits, licenses, health department approvals, food handler
              certifications and general liability insurance. <span className="req">*</span>
            </span>
          </label>

          {/* ------------------------------------------------ signature */}

          <div className="sig-row">
            <div className="field">
              <label className="label" htmlFor={`${uid}-sig`}>
                Type your full name to sign <span className="req">*</span>
              </label>
              <input
                className="input sig-input"
                id={`${uid}-sig`}
                name="signature_name"
                type="text"
                required
                maxLength={120}
                autoComplete="off"
                spellCheck={false}
                placeholder="Your name"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
              />
              <span className="hint">
                Typing your name here is your electronic signature under Texas law.
              </span>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-date`}>
                Date signed
              </label>
              <input
                className="input"
                id={`${uid}-date`}
                name="signed_date_display"
                type="text"
                readOnly
                value={signedDisplay}
                aria-readonly="true"
                tabIndex={-1}
              />
              <span className="hint">Filled in automatically.</span>
            </div>
          </div>

          {status === 'error' && message ? (
            <p className="formnote formnote--error" role="alert">
              {message}
            </p>
          ) : null}

          <div className="form__submit">
            <button className="btn btn--amber" type="submit" disabled={status === 'sending'}>
              {status === 'sending'
                ? 'Working on it'
                : spot === 'free'
                  ? 'Submit application'
                  : `Sign and pay ${fee}`}
            </button>
            <span className="hint">
              {spot === 'free'
                ? 'No payment for Coyote groups, booster clubs and nonprofits.'
                : 'You will land on a secure Square checkout page.'}
            </span>
          </div>
        </form>
      </div>
    </section>
  );
}
