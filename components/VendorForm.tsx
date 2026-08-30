'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  VendorAgreement,
  AGREEMENT_VERSION,
  AGREEMENT_SECTION_COUNT,
  AUTHORIZED_SIGNER,
  CONTRACTING_ENTITY,
} from './VendorAgreement';
import { REFUND_WINDOW, REVIEW_WINDOW } from '@/lib/approval';
import CardOnFile, { type CardHandle } from './CardOnFile';
import DayPicker from './DayPicker';
import {
  BOOKING_LABELS,
  MONTHLY_PRICING,
  addMonth,
  formatDayLong,
  todayKey,
  type BookingKind,
  type DayKey,
} from '@/lib/booking';
import StringLights from './StringLights';
import Fireworks from './Fireworks';
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
  spotType,
  onSpotTypeChange,
}: {
  signupClosed?: boolean;
  /**
   * Events to offer. Omitted by the prepaid page, which is scoped to whatever
   * event that vendor already paid for and falls back to the static calendar.
   */
  events?: EventOption[];
  eventSlug?: string;
  onEventChange?: (slug: string) => void;
  /**
   * The spot type, lifted when the parent needs it.
   *
   * ApplySection owns it on the public page, because intake is capped per type
   * and so the decision between this form and the waitlist depends on which
   * type is picked. The prepaid page renders this form directly and passes
   * neither, in which case the state stays local the way it always was.
   */
  spotType?: '' | 'booth' | 'truck' | 'free';
  onSpotTypeChange?: (spot: '' | 'booth' | 'truck' | 'free') => void;
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
  const [localSpot, setLocalSpot] = useState<'' | 'booth' | 'truck' | 'free'>('');
  // Controlled when the parent supplies both halves, local otherwise.
  const controlled = spotType !== undefined && onSpotTypeChange !== undefined;
  const spot = controlled ? spotType : localSpot;
  const setSpot = controlled ? onSpotTypeChange : setLocalSpot;
  const [spotError, setSpotError] = useState(false);
  /** What the submit button is doing, so a slow upload does not look frozen. */
  const [phase, setPhase] = useState<'' | 'preparing' | 'uploading' | 'finishing'>('');
  const [progress, setProgress] = useState(0);
  const [servesFood, setServesFood] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [permitsConfirmed, setPermitsConfirmed] = useState(false);
  const [signature, setSignature] = useState('');

  /* What is being booked. Prepaid vendors already paid for a specific event, so
     they never see this and are pinned to 'event'. */
  const [kind, setKind] = useState<BookingKind>('event');
  const [day, setDay] = useState<DayKey | ''>('');
  const [dayError, setDayError] = useState(false);

  /* The recurring charge acknowledgement. Kept as its own piece of state and
     its own tick box rather than folded into the agreement one, because
     consenting to be billed every month should be a separate deliberate act
     and it is recorded on the row as one. */
  const [recurringAccepted, setRecurringAccepted] = useState(false);
  const cardHandle = useRef<CardHandle | null>(null);
  const onCardReady = useCallback((handle: CardHandle | null) => {
    cardHandle.current = handle;
  }, []);

  const isMonthly = kind === 'monthly';
  const isDay = kind === 'day';

  /* Square's browser SDK needs the application and location ids in the page.
     Both are public identifiers, which is why they are NEXT_PUBLIC_ and why
     they can be read here directly: Next inlines them at build time, so there
     is nothing to drill down from the server. The access token is a different
     thing entirely and never leaves the server. */
  const squareApplicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? '';
  const squareLocationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? '';
  const squareEnvironment =
    process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

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

  const fee = isMonthly
    ? spot === 'truck'
      ? MONTHLY_PRICING.truck.price
      : spot === 'booth'
        ? MONTHLY_PRICING.booth.price
        : null
    : spot === 'truck'
      ? PRICING.truck.price
      : spot === 'booth'
        ? PRICING.booth.price
        : spot === 'free'
          ? PRICING.free.price
          : null;

  /* The two dates a recurring charge has to state before anyone agrees to it:
     when the first one lands and when the one after that does. The first is on
     approval rather than today, which is the honest answer and also the more
     reassuring one. */
  const firstChargeNote = 'on the day we approve you, not today';
  const nextChargeNote = fee ? `${fee} on the same date every month after that` : '';

  /**
   * What each spot type actually costs and requires, shown the moment it is
   * picked rather than left further down the page.
   */
  const spotNote = isMonthly
    ? spot === 'truck'
      ? `${MONTHLY_PRICING.truck.price} a month. A Texas DSHS health permit is required, and food handler certificates on site.`
      : spot === 'booth'
        ? `${MONTHLY_PRICING.booth.price} a month. No cooking or open flame in a booth space.`
        : null
    : spot === 'truck'
      ? `${PRICING.truck.price} per ${isDay ? 'day' : 'event'}. A Texas DSHS health permit is required, and food handler certificates on site.`
      : spot === 'booth'
        ? `${PRICING.booth.price} per ${isDay ? 'day' : 'event'}. No cooking or open flame in a booth space.`
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

    form.set('booking_kind', kind);
    if (isDay) form.set('booking_date', day);
    else form.delete('booking_date');

    if (!spot) {
      setStatus('error');
      setSpotError(true);
      setMessage('Pick a spot type before submitting.');
      return;
    }

    if (isDay && !day) {
      setStatus('error');
      setDayError(true);
      setMessage('Pick a date on the calendar before submitting.');
      return;
    }

    if (isMonthly) {
      if (spot === 'free') {
        setStatus('error');
        setSpotError(true);
        setMessage('A permanent monthly spot is a booth or a food truck.');
        return;
      }

      if (!recurringAccepted) {
        setStatus('error');
        setMessage('Tick the box acknowledging the monthly charge before submitting.');
        return;
      }

      /* Tokenise before anything is uploaded. A card that is going to be
         refused should be refused now, not after a minute of photos have gone
         up over a phone connection. */
      if (!cardHandle.current) {
        setStatus('error');
        setMessage('The card form has not finished loading. Give it a moment and try again.');
        return;
      }

      try {
        const { token: cardToken, verificationToken } = await cardHandle.current.tokenize();
        form.set('card_source_id', cardToken);
        if (verificationToken) form.set('card_verification_token', verificationToken);
        form.set('recurring_acknowledged', 'true');
      } catch (err) {
        setStatus('error');
        setMessage(
          err instanceof Error && err.message
            ? err.message
            : 'That card was not accepted. Check the details and try again.'
        );
        return;
      }
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
          : `We have your application and your signed agreement. It is not a confirmed spot yet. We review every application ${REVIEW_WINDOW} and email you either way.`
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
      <section className="section apply apply--done" id="apply" aria-labelledby="apply-title">
        <StringLights tone="dark" variant="top" swags={5} sag={30} id="apply-lights-done" />
        {/* The free organisation and prepaid paths finish here rather than on
            /vendors/confirmed, so the moment gets marked here too. */}
        <Fireworks />
        <div className="shell apply__donecard">
          <p className="eyebrow">Vendor application</p>
          <h2 id="apply-title">{prepaid ? 'You are registered' : 'We have your application'}</h2>
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
          {/* What is being booked, asked first, because it changes the fee, the
              date question and whether there is a card form further down.
              Prepaid vendors already paid for one specific event and never see
              this. */}
          {!prepaid ? (
            <div className="field">
              <span className="label">What are you booking</span>
              <div className="kindpick" role="radiogroup" aria-label="What are you booking">
                {(['event', 'day', 'monthly'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    className={`kindpick__opt ${kind === k ? 'is-on' : ''}`}
                    onClick={() => {
                      setKind(k);
                      setDayError(false);
                      // A permanent spot has no free option, so a free
                      // organisation switching to monthly has to pick again
                      // rather than silently submitting something invalid.
                      if (k === 'monthly' && spot === 'free') setSpot('');
                    }}
                  >
                    <span className="kindpick__name">{BOOKING_LABELS[k]}</span>
                    <span className="kindpick__note">
                      {k === 'event'
                        ? 'One of our event nights'
                        : k === 'day'
                          ? `Any other day we are open, ${PRICING.booth.price} booth, ${PRICING.truck.price} truck`
                          : `${MONTHLY_PRICING.booth.price} or ${MONTHLY_PRICING.truck.price} a month, every day`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
                {isMonthly ? (
                  <>
                    <option value="booth">
                      {MONTHLY_PRICING.booth.label}, {MONTHLY_PRICING.booth.price} a month
                    </option>
                    <option value="truck">
                      {MONTHLY_PRICING.truck.label}, {MONTHLY_PRICING.truck.price} a month
                    </option>
                  </>
                ) : (
                  <>
                    <option value="booth">
                      {PRICING.booth.label}, {PRICING.booth.price}
                    </option>
                    <option value="truck">
                      {PRICING.truck.label}, {PRICING.truck.price}
                    </option>
                    {/* No free option on a permanent spot: a space held every
                        day of the month is not something given away, and the
                        server refuses it either way. */}
                    <option value="free">{PRICING.free.label}, free</option>
                  </>
                )}
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

            {kind !== 'event' ? (
              /* A day or monthly booking is not tied to an event, so the
                 picker is replaced rather than left showing a choice that has
                 no bearing on what is being bought. */
              <div className="field">
                <span className="label">When</span>
                <p className="fieldnote">
                  {isMonthly
                    ? 'Every day, until you cancel. Event dates included at no extra charge.'
                    : day
                      ? formatDayLong(day)
                      : 'Pick a date on the calendar below.'}
                </p>
              </div>
            ) : events && eventSlug && onEventChange ? (
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

          {/* ------------------------------------------------ calendar */}

          {isDay ? (
            <div className={`field ${dayError ? 'has-error' : ''}`}>
              <span className="label">
                Pick your date <span className="req">*</span>
              </span>
              <DayPicker
                value={day}
                spot={spot}
                onChange={(picked) => {
                  setDay(picked);
                  setDayError(false);
                }}
              />
              {dayError ? (
                <span className="fielderror" role="alert">
                  Pick a date before submitting.
                </span>
              ) : null}
            </div>
          ) : null}

          {/* --------------------------------------- recurring terms */}

          {isMonthly ? (
            <>
              {/* Every fact about the charge, above the card form rather than
                  below it. Someone should never have to enter a card to find
                  out what it is about to be used for. */}
              <div className="recurring">
                <p className="recurring__hd">Your monthly charge</p>

                <dl className="recurring__facts">
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      <b>{fee ?? 'Pick a booth or a truck above'}</b>
                      {fee ? ' per month' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>How often</dt>
                    <dd>
                      <b>Every month</b>, automatically, to the card you enter below
                    </dd>
                  </div>
                  <div>
                    <dt>First charge</dt>
                    <dd>
                      <b>{firstChargeNote}</b>. Nothing is taken when you submit this form.
                    </dd>
                  </div>
                  <div>
                    <dt>Charges after that</dt>
                    <dd>
                      {nextChargeNote ||
                        'The same amount on the same date each month'}. For example, approved on{' '}
                      {formatDayLong(todayKey())} means the next charge on{' '}
                      {formatDayLong(addMonth(todayKey()))}.
                    </dd>
                  </div>
                  <div>
                    <dt>How to cancel</dt>
                    <dd>
                      Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> or call{' '}
                      <a href="tel:5404479432">540 447 9432</a> and say you want to cancel. There is
                      no notice period and no fee.{' '}
                      <b>
                        Cancelling stops the next charge. You keep the spot to the end of the month
                        you have already paid for, and no part month is refunded.
                      </b>
                    </dd>
                  </div>
                  <div>
                    <dt>If a payment fails</dt>
                    <dd>
                      We email you and try the card again over the following days. You keep your
                      spot through the month you have paid for while you sort the card out.
                    </dd>
                  </div>
                </dl>
              </div>

              <CardOnFile
                applicationId={squareApplicationId}
                locationId={squareLocationId}
                environment={squareEnvironment}
                amountCents={
                  spot === 'truck'
                    ? MONTHLY_PRICING.truck.cents
                    : spot === 'booth'
                      ? MONTHLY_PRICING.booth.cents
                      : 0
                }
                contactName={signature || 'Vendor'}
                email=""
                onReady={onCardReady}
              />

              {/* Its own box, separate from the agreement one below. Agreeing
                  to the terms and agreeing to be billed every month are two
                  different consents and are recorded as two. */}
              <label className="check check--recurring">
                <input
                  type="checkbox"
                  name="recurring_acknowledged"
                  checked={recurringAccepted}
                  onChange={(e) => setRecurringAccepted(e.target.checked)}
                  required
                />
                <span>
                  I understand this is a <b>recurring monthly charge of {fee ?? 'the monthly fee'}</b>,
                  taken automatically from the card above every month starting when my application
                  is approved, and continuing until I cancel. I understand that cancelling stops the
                  next charge and that no part month is refunded.{' '}
                  <span className="req">*</span>
                </span>
              </label>
            </>
          ) : null}

          {/* --------------------------------------------- agreement */}

          <div className="field">
            <span className="label">
              Vendor Participation Agreement, read all {AGREEMENT_SECTION_COUNT} sections
            </span>
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
              Scroll inside the box to read all {AGREEMENT_SECTION_COUNT} sections. Version{" "}
              {AGREEMENT_VERSION}. This
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

          {/* The review rule, immediately above the pay button rather than in
              the intro copy, because this is the last thing read before money
              moves and it is the one thing a vendor must not be surprised by
              afterwards. Prepaid vendors were agreed by phone and are not in
              the queue, so they do not see it. */}
          {!prepaid ? (
            <p className="formnote formnote--warn reviewnote" role="note">
              <b>
                {isMonthly ? 'Entering a card does not confirm your spot.' : 'Paying does not confirm your spot.'}
              </b>{' '}
              It reserves your place in the review queue. We review every application{' '}
              {REVIEW_WINDOW} and email you either way.{' '}
              {isMonthly ? (
                <>
                  Nothing is charged until we approve you. If we cannot accommodate you, your card
                  is released and never charged at all.
                </>
              ) : spot === 'free' ? (
                <>
                  Nothing is charged for an Alice organization spot, so there is nothing to refund
                  if we cannot fit you in.
                </>
              ) : (
                <>
                  If we cannot accommodate you, you are refunded in full automatically, and it takes{' '}
                  {REFUND_WINDOW} to appear on your statement.
                </>
              )}
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
                  : isMonthly
                    ? fee
                      ? `Apply for a ${fee} a month spot`
                      : 'Apply for a permanent spot'
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
                : isMonthly
                  ? fee
                    ? `Your card is saved now and charged ${fee} only when we approve you. Nothing is taken today.`
                    : 'Pick a booth or a truck above to see your monthly fee.'
                  : spot === 'free'
                    ? 'Alice organizations set up at no charge, so there is no payment step.'
                    : fee
                      ? `You will be charged ${fee} at Square checkout, which puts you in the review queue. Nothing is taken before that.`
                      : 'Pick a spot type above to see your fee.'}
            </span>
          </div>
        </form>
      </div>
    </section>
  );
}
