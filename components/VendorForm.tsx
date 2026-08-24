'use client';

import { useEffect, useId, useState } from 'react';
import { VendorAgreement, AGREEMENT_VERSION } from './VendorAgreement';
import StringLights from './StringLights';
import { EVENTS, PRICING, SITE } from '@/lib/seo';

/** Kept in step with ALLOWED_LABEL in lib/uploads.ts. */
const ALLOWED_HINT = 'JPG, PNG, WEBP, HEIC or PDF.';

type Status = 'idle' | 'sending' | 'error' | 'done';

/** Mirrors the server side rules in lib/uploads.ts. The server is the gate. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 3;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

export default function VendorForm({ signupClosed = false }: { signupClosed?: boolean }) {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [spot, setSpot] = useState<'booth' | 'truck' | 'free'>('booth');
  const [servesFood, setServesFood] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [permitsConfirmed, setPermitsConfirmed] = useState(false);
  const [signature, setSignature] = useState('');

  // A food handler permit is required for any truck, and for any booth whose
  // vendor says they serve food. Checked again on the server.
  const permitRequired = spot === 'truck' || servesFood;

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

    // Sent as multipart so the uploads travel with the application. The field
    // names are unchanged; the server reads them the same way it always did.
    // No agreement_version is sent on purpose: the server stamps the version it
    // actually served, so a client cannot claim to have signed a different one.
    const form = new FormData(e.currentTarget);
    form.set('waiver_accepted', String(agreementAccepted));
    form.set('permits_confirmed', String(permitsConfirmed));
    form.set('serves_food', String(servesFood));
    form.set('signature_name', signature.trim());
    form.set('signed_date', signedISO);
    form.delete('signed_date_display');

    // Drop empty file inputs so the server does not see zero byte parts.
    for (const key of ['logo', 'permit']) {
      const value = form.get(key);
      if (value instanceof File && value.size === 0) form.delete(key);
    }
    const photos = form.getAll('photos').filter((p) => p instanceof File && p.size > 0);
    form.delete('photos');
    for (const photo of photos.slice(0, MAX_PHOTOS)) form.append('photos', photo);

    // Client side courtesy checks. lib/uploads.ts is the real gate.
    const tooBig = [form.get('logo'), form.get('permit'), ...photos].find(
      (f) => f instanceof File && f.size > MAX_UPLOAD_BYTES
    );
    if (tooBig instanceof File) {
      setStatus('error');
      setMessage(`${tooBig.name} is over the 10MB limit. Shrink it and try again.`);
      return;
    }

    if (permitRequired && !(form.get('permit') instanceof File)) {
      setStatus('error');
      setMessage('A food handler permit is required for food trucks and anyone serving food.');
      return;
    }

    try {
      const res = await fetch('/api/vendor-application', {
        method: 'POST',
        body: form,
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
        'We have your application and your signed agreement. We will email you your spot number before the event.'
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

  // Signup is shut. The API route rejects late applications regardless, so this
  // is the visible half of a rule that is enforced on the server.
  if (signupClosed) {
    return (
      <section className="section apply" id="apply" aria-labelledby="apply-title">
        <StringLights tone="dark" variant="top" swags={5} sag={30} id="apply-lights-closed" />
        <div className="shell">
          <p className="eyebrow">Vendor application</p>
          <h2 id="apply-title">Signup is closed for this event</h2>
          <p className="lede muted">
            The cutoff for {EVENTS[0].name} was {EVENTS[0].signupClosesDisplay} Central. We close
            signup two days out so we can lay out the lot and assign spot numbers.
          </p>
          <p className="hint">
            Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we will put you on the
            list for the next event.
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
          Booths are {PRICING.booth.price} per event and truck spots are {PRICING.truck.price}.
          Alice organizations set up at no charge. Fill this out, upload your permit if you serve
          food, sign the agreement and pay.
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

          <label className="check">
            <input
              type="checkbox"
              name="serves_food_box"
              checked={servesFood}
              onChange={(e) => setServesFood(e.target.checked)}
            />
            <span>
              I prepare, sample, serve or sell food or drinks. Food trucks are always counted as
              serving food.
            </span>
          </label>

          {/* ------------------------------------------------- uploads */}

          <fieldset className="uploads">
            <legend className="label">Photos and permits</legend>
            <p className="hint uploads__intro">
              {ALLOWED_HINT} Up to 10MB each. We use your logo and photos to post about you
              before the event. Permits are stored privately and are only visible to us.
            </p>

            <div className="field">
              <label className="label" htmlFor={`${uid}-logo`}>
                Business logo
              </label>
              <input
                className="file"
                id={`${uid}-logo`}
                name="logo"
                type="file"
                accept={ACCEPT}
              />
              <span className="hint">Optional. We post this with your name.</span>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-photos`}>
                Business or food photos
              </label>
              <input
                className="file"
                id={`${uid}-photos`}
                name="photos"
                type="file"
                accept={ACCEPT}
                multiple
              />
              <span className="hint">
                Up to {MAX_PHOTOS}.
              </span>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-permit`}>
                Food handler permit{' '}
                {permitRequired ? <span className="req">*</span> : <span>(if you serve food)</span>}
              </label>
              <input
                className="file"
                id={`${uid}-permit`}
                name="permit"
                type="file"
                accept={ACCEPT}
                required={permitRequired}
                aria-describedby={`${uid}-permit-hint`}
              />
              <span className="hint" id={`${uid}-permit-hint`}>
                {permitRequired
                  ? 'Required for your spot type. A photo or a PDF of the certificate works.'
                  : 'Required if you tick the food box above or pick a food truck spot.'}
              </span>
            </div>
          </fieldset>

          {/* --------------------------------------------- agreement */}

          <div className="field">
            <span className="label">Vendor Participation Agreement, read all 18 sections</span>
            <div className="agreement-scrollwrap">
              <div
                className="agreement-scroll"
                tabIndex={0}
                role="region"
                aria-label="Coyoteville Vendor Participation Agreement, scrollable"
              >
                <VendorAgreement />
              </div>
            </div>
            <span className="hint hint--scroll">
              Scroll inside the box to read all 18 sections. Version {AGREEMENT_VERSION}. This
              exact version gets saved with your signature.
            </span>
          </div>

          <label className="check">
            <input
              type="checkbox"
              name="waiver_accepted"
              checked={agreementAccepted}
              onChange={(e) => setAgreementAccepted(e.target.checked)}
              required
            />
            <span>
              I have read the Coyoteville Vendor Participation Agreement above and I agree to all
              of it, including the release of liability, the indemnification covering the Released
              Parties own negligence, and the assumption of risk.{' '}
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
                ? 'Alice organizations set up at no charge, so there is no payment step.'
                : 'Checkout runs through Square.'}
            </span>
          </div>
        </form>
      </div>
    </section>
  );
}
