'use client';

import { useEffect, useId, useState } from 'react';
import {
  VendorAgreement,
  AGREEMENT_VERSION,
  AUTHORIZED_SIGNER,
  CONTRACTING_ENTITY,
} from './VendorAgreement';
import StringLights from './StringLights';
import NextSteps from './NextSteps';
import EventPicker from './EventPicker';
import type { EventOption } from '@/lib/event-options';
import { EVENTS, PRICING, SITE } from '@/lib/seo';

/** Kept in step with ALLOWED_LABEL in lib/uploads.ts. */
const ALLOWED_HINT = 'JPG, PNG, WEBP, HEIC or PDF.';

type Status = 'idle' | 'sending' | 'error' | 'done';

/** Mirrors the server side rules in lib/uploads.ts. The server is the gate. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 3;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

/** Longest edge and quality images are resized to before sending. */
const IMAGE_MAX_EDGE = 1600;
const IMAGE_QUALITY = 0.82;

/**
 * Shrink an image in the browser before it is uploaded.
 *
 * A phone photo is commonly 3 to 6MB, and a logo, three photos and a permit
 * straight off a camera roll comes to around 20MB. That is several times what a
 * serverless request body comfortably takes and over a minute of uploading on a
 * phone connection, which is what a submission failing part way through looks
 * like. Resizing to 1600px on the long edge takes a typical photo to a few
 * hundred kilobytes and is still far more resolution than the site or a social
 * post needs.
 *
 * PDFs and anything the browser cannot decode are passed through untouched, and
 * a result that somehow came out larger is discarded in favour of the original.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic' || file.type === 'image/heif') {
    // HEIC cannot be decoded by most browsers. It goes as-is and the server
    // accepts it; iOS usually converts to JPEG on pick anyway.
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough and already modest in size: leave it alone.
    if (scale === 1 && file.size <= 900 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY)
    );

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    // Anything unreadable goes as it came. The server validates either way.
    return file;
  }
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type SubmitResponse = { ok?: boolean; error?: string; checkoutUrl?: string | null };

/**
 * Post the form and report upload progress.
 *
 * fetch cannot report how much of a request body has gone out, and on a phone
 * connection this upload can take a minute, so XMLHttpRequest is used purely
 * for upload.onprogress. Failures become messages that name what happened
 * rather than a generic apology.
 */
function postWithProgress(
  url: string,
  body: FormData,
  onProgress: (percent: number) => void
): Promise<SubmitResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = 120_000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    const tooLarge =
      'Your files were too large for one submission. Remove a photo and try again.';

    xhr.onload = () => {
      if (xhr.status === 413) {
        reject(new Error(tooLarge));
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText) as SubmitResponse);
      } catch {
        // A non JSON body means the request never reached the handler, which is
        // usually a gateway rejecting it before we ever see it.
        reject(new Error('The server sent back something we could not read. Try again in a minute.'));
      }
    };

    xhr.ontimeout = () =>
      reject(
        new Error(
          'That took too long to upload, so nothing was submitted and nothing was charged. Try again on a stronger connection, or with fewer photos.'
        )
      );

    xhr.onerror = () =>
      reject(new Error('We could not reach the server. Check your connection and try again.'));

    xhr.send(body);
  });
}

/**
 * The vendor application.
 *
 * Two callers share this: the public form, which ends at Square checkout, and
 * the hidden prepaid link, which posts to its own route and never takes a
 * payment. One component so the agreement, the uploads and the validation
 * cannot drift apart between the two.
 */
export default function VendorForm({
  signupClosed = false,
  endpoint = '/api/vendor-application',
  prepaid = false,
  token,
  closedTitle = 'Signup is closed for this event',
  closedBody,
  supportEmail = SITE.email,
  events,
  eventSlug,
  onEventChange,
}: {
  signupClosed?: boolean;
  /**
   * Events to offer. Omitted by the prepaid page, which is scoped to whatever
   * event that vendor already paid for and falls back to the static calendar.
   */
  events?: EventOption[];
  eventSlug?: string;
  onEventChange?: (slug: string) => void;
  /** Where the form posts. */
  endpoint?: string;
  /** Prepaid vendors already paid, so there is no checkout step. */
  prepaid?: boolean;
  /** Prepaid link token, echoed back so the route can re-check it. */
  token?: string;
  closedTitle?: string;
  closedBody?: React.ReactNode;
  /**
   * Passed in from the server. SUPPORT_EMAIL is not inlined into the client
   * bundle, so reading it here directly would disagree with the server render.
   */
  supportEmail?: string;
}) {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  /**
   * No default on purpose. Booth and truck carry different fees and different
   * permit rules, and a pre-selected booth meant people submitted without ever
   * reading the field. Empty until they actually choose.
   */
  const [spot, setSpot] = useState<'' | 'booth' | 'truck' | 'free'>('');
  const [spotError, setSpotError] = useState(false);
  /** What the submit button is doing, so a slow upload does not look frozen. */
  const [phase, setPhase] = useState<'' | 'preparing' | 'uploading' | 'finishing'>('');
  const [progress, setProgress] = useState(0);
  const [servesFood, setServesFood] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [permitsConfirmed, setPermitsConfirmed] = useState(false);
  const [signature, setSignature] = useState('');

  // A health permit is required for any truck, and for any booth whose
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
    spot === 'truck'
      ? PRICING.truck.price
      : spot === 'booth'
        ? PRICING.booth.price
        : spot === 'free'
          ? PRICING.free.price
          : null;

  /**
   * What each spot type actually costs and requires, shown the moment it is
   * picked rather than left further down the page.
   */
  const spotNote =
    spot === 'truck'
      ? `${PRICING.truck.price} per event. A Texas DSHS health permit is required, and food handler certificates on site.`
      : spot === 'booth'
        ? `${PRICING.booth.price} per event. No cooking or open flame in a booth space.`
        : spot === 'free'
          ? 'Free. Alice organizations set up at no charge.'
          : null;

  const heading = prepaid ? 'Register your spot' : 'Get your spot';

  /** True for the whole submission, including the resize before the upload. */
  const sending = status === 'sending';

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
    if (prepaid && token) form.set('prepaid_token', token);

    if (!spot) {
      setStatus('error');
      setSpotError(true);
      setMessage('Pick a spot type before submitting.');
      return;
    }

    // Drop empty file inputs so the server does not see zero byte parts.
    for (const key of ['logo', 'permit']) {
      const value = form.get(key);
      if (value instanceof File && value.size === 0) form.delete(key);
    }
    const rawPhotos = form
      .getAll('photos')
      .filter((p): p is File => p instanceof File && p.size > 0);
    form.delete('photos');

    if (permitRequired && !(form.get('permit') instanceof File)) {
      setStatus('error');
      setMessage(
        'Food trucks must upload a Texas DSHS health permit, and anyone serving food must upload their permit. Add yours and submit again.'
      );
      return;
    }

    // Shrink the images before they go anywhere. This is what keeps a camera
    // roll submission inside the request limit and inside a sane upload time.
    setPhase('preparing');
    try {
      const logo = form.get('logo');
      if (logo instanceof File) form.set('logo', await compressImage(logo));

      const permit = form.get('permit');
      if (permit instanceof File) form.set('permit', await compressImage(permit));

      for (const photo of rawPhotos.slice(0, MAX_PHOTOS)) {
        form.append('photos', await compressImage(photo));
      }
    } catch {
      // Fall back to the originals rather than blocking the submission.
      form.delete('photos');
      for (const photo of rawPhotos.slice(0, MAX_PHOTOS)) form.append('photos', photo);
    }

    const files = [form.get('logo'), form.get('permit'), ...form.getAll('photos')].filter(
      (x): x is File => x instanceof File
    );

    const oversize = files.find((x) => x.size > MAX_UPLOAD_BYTES);
    if (oversize) {
      setStatus('error');
      setPhase('');
      setMessage(
        `${oversize.name} is ${mb(oversize.size)} and the limit for one file is 10MB. Pick a smaller one and submit again.`
      );
      return;
    }

    const total = files.reduce((n, x) => n + x.size, 0);
    if (total > MAX_TOTAL_UPLOAD_BYTES) {
      setStatus('error');
      setPhase('');
      setMessage(
        `Your files still add up to ${mb(total)} after resizing, and the limit for one submission is 8MB. Remove a photo or two and submit again.`
      );
      return;
    }

    try {
      setPhase('uploading');
      setProgress(0);

      const data = await postWithProgress(endpoint, form, (pct) => {
        setProgress(pct);
        if (pct >= 100) setPhase('finishing');
      });

      if (!data.ok) {
        setStatus('error');
        setPhase('');
        setMessage(data.error || 'Something went wrong on our end. Try again in a minute.');
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setStatus('done');
      setMessage(
        prepaid
          ? 'Your spot is registered and your agreement is signed. No payment is due, you already paid. We will email your spot number before the event.'
          : 'We have your application and your signed agreement. We will email you your spot number before the event.'
      );
    } catch (err) {
      setStatus('error');
      setPhase('');
      setMessage(
        err instanceof Error && err.message
          ? err.message
          : 'We could not reach the server. Check your connection and try again.'
      );
    }
  }

  if (status === 'done') {
    return (
      <section className="section apply" id="apply" aria-labelledby="apply-title">
        <StringLights tone="dark" variant="top" swags={5} sag={30} id="apply-lights-done" />
        <div className="shell">
          <p className="eyebrow">Vendor application</p>
          <h2 id="apply-title">{prepaid ? 'You are registered' : 'You are in'}</h2>
          <p className="lede">{message}</p>
          <p className="hint">
            Questions in the meantime, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
          </p>
        </div>

        <NextSteps spot={spot} id="applied-next" />
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
          <h2 id="apply-title">{closedTitle}</h2>
          <p className="lede muted">
            {closedBody ?? (
              <>
                We close signup two days out so we can lay out the lot and assign spot numbers.
              </>
            )}
          </p>
          <p className="hint">
            Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will put you on the
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
        <h2 id="apply-title">{heading}</h2>
        <p className="lede muted">
          {prepaid ? (
            <>
              You have already paid, so there is no payment step. Fill this out, upload your DSHS
              health permit if you are bringing a food truck, and sign the agreement to register
              your spot.
            </>
          ) : (
            <>
              Booths are {PRICING.booth.price} per event and truck spots are {PRICING.truck.price}.
              Alice organizations set up at no charge. Fill this out, upload your DSHS health
              permit if you are bringing a food truck, sign the agreement and pay.
            </>
          )}
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
                aria-invalid={spotError || undefined}
                aria-describedby={spotError ? `${uid}-spot-error` : `${uid}-spot-note`}
                onChange={(e) => {
                  setSpot(e.target.value as 'booth' | 'truck' | 'free');
                  setSpotError(false);
                }}
                onInvalid={(e) => {
                  // Native validation still blocks the submit. This suppresses
                  // the browser's own bubble so the message can be shown inline
                  // where the rest of the form's errors appear.
                  e.preventDefault();
                  setSpotError(true);
                }}
              >
                <option value="" disabled>
                  Choose one
                </option>
                <option value="booth">{PRICING.booth.label}, {PRICING.booth.price}</option>
                <option value="truck">{PRICING.truck.label}, {PRICING.truck.price}</option>
                <option value="free">{PRICING.free.label}, free</option>
              </select>

              {spotError ? (
                <span className="fielderror" id={`${uid}-spot-error`} role="alert">
                  Pick a spot type. Booths and food trucks have different fees and different
                  permit rules.
                </span>
              ) : spotNote ? (
                <span className="fieldnote" id={`${uid}-spot-note`}>
                  {spotNote}
                </span>
              ) : (
                <span className="hint" id={`${uid}-spot-note`}>
                  Pick one to see the fee and what is required.
                </span>
              )}
            </div>

            {events && eventSlug && onEventChange ? (
              <EventPicker
                id={`${uid}-event`}
                events={events}
                value={eventSlug}
                onChange={onEventChange}
              />
            ) : (
              /* Prepaid link: no choice to make, so the slug rides along as a
                 hidden field rather than as a select with one option. */
              <div className="field">
                <label className="label" htmlFor={`${uid}-event`}>
                  Which event <span className="req">*</span>
                </label>
                <select
                  className="select"
                  id={`${uid}-event`}
                  name="event_slug"
                  required
                  defaultValue={eventSlug ?? EVENTS[0].slug}
                >
                  {EVENTS.map((event) => (
                    <option key={event.slug} value={event.slug}>
                      {event.name}, {event.displayDate}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                DSHS health permit{' '}
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
                  ? spot === 'truck'
                    ? 'Food trucks must upload a current Texas Department of State Health Services health permit. A photo or a PDF works.'
                    : 'Required because you are serving food. A photo or a PDF of your health permit works.'
                  : 'Required if you tick the food box above. Food trucks must upload a Texas DSHS health permit.'}
              </span>
            </div>
          </fieldset>

          {/* --------------------------------------------- agreement */}

          <div className="field">
            <span className="label">Vendor Participation Agreement, read all 18 sections</span>
            <p className="counterparty">
              You are entering into an agreement with <b>{CONTRACTING_ENTITY}</b>,{' '}
              {AUTHORIZED_SIGNER}.
            </p>
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
            {/* Disabled for the whole submission, not just the network call, so
                a slow upload cannot be double submitted by an impatient tap. */}
            <button className="btn btn--amber" type="submit" disabled={sending}>
              {sending
                ? phase === 'preparing'
                  ? 'Preparing your photos'
                  : phase === 'finishing'
                    ? 'Almost done'
                    : `Uploading ${progress}%`
                : prepaid
                  ? 'Register my spot'
                  : spot === 'free'
                    ? 'Submit application'
                    : fee
                      ? `Sign and pay ${fee}`
                      : 'Sign and pay'}
            </button>
            {sending ? (
              <span
                className="uploadbar"
                role="progressbar"
                aria-valuenow={phase === 'uploading' ? progress : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Submitting your application"
              >
                <i style={{ width: phase === 'preparing' ? '6%' : `${Math.max(progress, 4)}%` }} />
              </span>
            ) : null}

            <span className="hint">
              {sending
                ? phase === 'preparing'
                  ? 'Resizing your photos so they upload quickly. Do not close this page.'
                  : phase === 'finishing'
                    ? 'Files are up. Saving your application.'
                    : 'Uploading. This can take a minute on a phone connection, so do not close this page.'
                : prepaid
                ? 'No payment is taken here. Your fee is already settled.'
                : spot === 'free'
                  ? 'Alice organizations set up at no charge, so there is no payment step.'
                  : fee
                    ? `You will be charged ${fee} at Square checkout. Nothing is taken before that.`
                    : 'Pick a spot type above to see your fee.'}
            </span>
          </div>
        </form>
      </div>
    </section>
  );
}
