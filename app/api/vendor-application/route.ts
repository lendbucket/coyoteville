import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getSquare, getSquareLocationId, isSquareConfigured } from '@/lib/square';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { AGREEMENT_VERSION } from '@/components/VendorAgreement';
import { EVENTS, PRICING, SITE_URL } from '@/lib/seo';
import { getScheduledEvent } from '@/lib/event-schedule';
import {
  MONTHLY_PRICING,
  formatDayLong,
  isBookingKind,
  isDayKey,
  isMonthlySpot,
  priceForBooking,
  type BookingKind,
  type MonthlySpot,
} from '@/lib/booking';
import { canBook, getDayStatus, monthlyRoomFor, type DayStatus } from '@/lib/days';
import { isSubscriptionsConfigured, storeCardOnFile } from '@/lib/subscriptions';
import {
  MAX_PHOTOS,
  MAX_TOTAL_UPLOAD_BYTES,
  UploadError,
  storeUpload,
  validateUpload,
  type ValidatedUpload,
} from '@/lib/uploads';
import { getSpots, invalidateSpots, reviewSlotFor } from '@/lib/spots';
import { notifyPaymentReceived, notifyRegistrationStarted } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Uploads over a phone connection are slow. The default is comfortable now but
 * stating it means a platform default change cannot silently start cutting
 * submissions off part way through.
 */
export const maxDuration = 60;

/**
 * Structured failure logging.
 *
 * Every failure is written as one line beginning [vendor-application] with the
 * stage it failed at, so a real submission problem can be found without
 * guessing. Deliberately carries no personal data and no token: business name,
 * contact details, signature and file contents are all left out. Sizes, counts,
 * error codes and the stage are enough to diagnose it.
 */
type Stage =
  | 'rate-limit'
  | 'parse'
  | 'validation'
  | 'deadline'
  /** No review slots left for the type asked for, so intake has shut. */
  | 'full'
  | 'upload-validation'
  | 'db-config'
  | 'db-insert'
  | 'upload-storage'
  | 'upload-record'
  /** A day that is closed, past, an event date, or out of review slots. */
  | 'day-unavailable'
  /** Monthly signup reached with no Square plan variations configured. */
  | 'subscription-config'
  | 'subscription'
  | 'square';

/** Why a day cannot be booked, in words a vendor can act on. */
function dayRefusal(status: DayStatus): string {
  switch (status.reason) {
    case 'past':
      return 'That date has already been. Pick one from today onward.';
    case 'beyond-horizon':
      return 'That date is further out than we are taking bookings for. Pick something sooner.';
    case 'event':
      return `${formatDayLong(status.day)} is ${status.eventName}. Event dates go through the event signup, not the day calendar.`;
    case 'closed':
      return `We are closed on ${formatDayLong(status.day)}. Pick another date.`;
    case 'full':
      return `We have taken all the applications we can review for ${formatDayLong(status.day)}. Pick another date.`;
    default:
      return 'That date is not available. Pick another one.';
  }
}

function logFailure(
  stage: Stage,
  detail: Record<string, unknown>,
  err?: unknown
): void {
  const e = err as { message?: string; code?: string; name?: string; status?: number } | undefined;

  console.error(
    '[vendor-application]',
    JSON.stringify({
      stage,
      ...detail,
      errorName: e?.name,
      errorMessage: e?.message,
      errorCode: e?.code,
      errorStatus: e?.status,
    })
  );
}

/** File count and total bytes in a request, for the log line. */
function uploadShape(form: FormData | null): { fileCount: number; totalBytes: number } {
  if (!form) return { fileCount: 0, totalBytes: 0 };

  let fileCount = 0;
  let totalBytes = 0;
  for (const [, value] of form.entries()) {
    if (value instanceof File && value.size > 0) {
      fileCount += 1;
      totalBytes += value.size;
    }
  }
  return { fileCount, totalBytes };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Payload = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Server side validation. The client checks are a courtesy, this is the gate. */
function validate(body: Payload) {
  const errors: string[] = [];

  const business_name = str(body.business_name);
  const contact_name = str(body.contact_name);
  const phone = str(body.phone);
  const email = str(body.email).toLowerCase();
  const spot_type = str(body.spot_type);
  const event_slug = str(body.event_slug);
  const sells = str(body.sells);
  const notes = str(body.notes);
  const signature_name = str(body.signature_name);
  const signed_date = str(body.signed_date);

  // What is being booked. Anything unrecognised falls back to an event, which
  // is what every request looked like before daily and monthly existed.
  const raw_kind = str(body.booking_kind) || 'event';
  const booking_kind: BookingKind = isBookingKind(raw_kind) ? raw_kind : 'event';
  const booking_date = str(body.booking_date);

  const waiver_accepted = body.waiver_accepted === true;
  const permits_confirmed = body.permits_confirmed === true;
  const serves_food = body.serves_food === true;
  const recurring_acknowledged = body.recurring_acknowledged === true;

  // Single use card token from the Web Payments SDK. Never a card number: by
  // the time it reaches this server it has already been tokenised in the page.
  const card_source_id = str(body.card_source_id);
  const card_verification_token = str(body.card_verification_token);

  if (business_name.length < 2 || business_name.length > 120) {
    errors.push('Give us your business name.');
  }
  if (contact_name.length < 2 || contact_name.length > 120) {
    errors.push('Give us a contact name.');
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15 || phone.length > 32) {
    errors.push('That phone number does not look right.');
  }

  if (!EMAIL_RE.test(email) || email.length > 180) {
    errors.push('That email does not look right.');
  }

  if (!['booth', 'truck', 'free'].includes(spot_type)) {
    errors.push('Pick a spot type.');
  }

  if (booking_kind === 'event') {
    if (!EVENTS.some((e) => e.slug === event_slug)) {
      errors.push('Pick an event.');
    }
  } else if (booking_kind === 'day') {
    if (!isDayKey(booking_date)) {
      errors.push('Pick a date on the calendar.');
    }
  } else {
    // Monthly. A permanent spot is a booth or a truck; there is no recurring
    // free organisation spot, because a free spot costs nothing to hold.
    if (!isMonthlySpot(spot_type)) {
      errors.push('A permanent monthly spot is a booth or a food truck.');
    }
    if (!recurring_acknowledged) {
      errors.push(
        'Tick the box acknowledging the monthly recurring charge before we can take your application.'
      );
    }
    if (!card_source_id) {
      errors.push('Enter a card. A permanent spot is billed monthly to a card on file.');
    }
  }

  if (sells.length < 2 || sells.length > 300) {
    errors.push('Tell us what you sell.');
  }

  if (notes.length > 2000) {
    errors.push('Trim the notes down a little.');
  }

  if (!waiver_accepted) {
    errors.push('You have to agree to the Vendor Participation Agreement before we can take your application.');
  }

  if (!permits_confirmed) {
    errors.push('You have to confirm you carry your own permits and insurance.');
  }

  if (signature_name.length < 2 || signature_name.length > 120) {
    errors.push('Type your full name in the signature field to sign.');
  }

  return {
    errors,
    value: {
      business_name,
      contact_name,
      phone,
      email,
      spot_type,
      // Only the column that belongs to this kind is carried through, which is
      // the same rule the database check constraint enforces.
      event_slug: booking_kind === 'event' ? event_slug : null,
      booking_kind,
      booking_date: booking_kind === 'day' ? booking_date : null,
      sells,
      notes: notes || null,
      signature_name,
      signed_date,
      waiver_accepted,
      permits_confirmed,
      serves_food,
      recurring_acknowledged,
      card_source_id,
      card_verification_token,
    },
  };
}

/**
 * Pull the text fields out of a multipart body into the shape validate() has
 * always taken. Files are handled separately; checkbox fields arrive as the
 * strings "true" and "false" and are coerced back to booleans here.
 */
const BOOLEAN_FIELDS = new Set([
  'waiver_accepted',
  'permits_confirmed',
  'serves_food',
  'recurring_acknowledged',
]);

function fieldsFromFormData(form: FormData): Payload {
  const body: Payload = {};

  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string') continue;
    body[key] = BOOLEAN_FIELDS.has(key) ? value === 'true' : value;
  }

  return body;
}

/**
 * Sort the uploads into the one that can block and the ones that cannot.
 *
 * The permit is a regulatory document, so a truck or a food vendor without a
 * valid one is refused outright. A logo or a photo is promotional: if it is
 * unreadable or too big, the reason is recorded and the application carries on
 * without it. Losing a paying vendor because a photo failed is the wrong trade.
 *
 * Throws only for the permit and for a request that is too large overall.
 */
async function collectUploads(
  form: FormData,
  spotType: string,
  servesFood: boolean
): Promise<{ permit: ValidatedUpload | null; media: ValidatedUpload[]; issues: string[] }> {
  const media: ValidatedUpload[] = [];
  const issues: string[] = [];

  const { totalBytes } = uploadShape(form);
  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    const cap = Math.round(MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024));
    throw new UploadError(
      `Your files add up to ${mb}MB and the limit for one submission is ${cap}MB. Remove a photo or two and submit again.`
    );
  }

  // Permit first, because it is the only one that can stop the submission.
  const permit = form.get('permit');
  const permitRequired = spotType === 'truck' || servesFood;
  let validatedPermit: ValidatedUpload | null = null;

  if (permit instanceof File && permit.size > 0) {
    validatedPermit = await validateUpload(permit, 'permit', 'Your health permit');
  } else if (permitRequired) {
    throw new UploadError(
      'Food trucks must upload a Texas DSHS health permit, and anyone serving food must upload their permit. Add yours and submit again.'
    );
  }

  const logo = form.get('logo');
  if (logo instanceof File && logo.size > 0) {
    try {
      media.push(await validateUpload(logo, 'logo', 'Your logo'));
    } catch (err) {
      issues.push(`logo rejected: ${err instanceof Error ? err.message : 'unreadable'}`);
    }
  }

  const photos = form.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
  for (const [i, photo] of photos.slice(0, MAX_PHOTOS).entries()) {
    try {
      media.push(await validateUpload(photo, 'photo', `Photo ${i + 1}`));
    } catch (err) {
      issues.push(`photo ${i + 1} rejected: ${err instanceof Error ? err.message : 'unreadable'}`);
    }
  }

  if (photos.length > MAX_PHOTOS) {
    issues.push(`${photos.length} photos sent, only the first ${MAX_PHOTOS} were kept`);
  }

  return { permit: validatedPermit, media, issues };
}

/** Trust the browser date only if it is sane. Otherwise stamp it here. */
function resolveSignedDate(clientDate: string): string {
  const serverDate = new Date();
  const serverISO = serverDate.toISOString().slice(0, 10);

  if (!DATE_RE.test(clientDate)) return serverISO;

  const parsed = Date.parse(`${clientDate}T12:00:00Z`);
  if (Number.isNaN(parsed)) return serverISO;

  const driftDays = Math.abs(parsed - serverDate.getTime()) / 86_400_000;
  return driftDays <= 2 ? clientDate : serverISO;
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || 'unknown';

  // Two limits, because an address is not a person.
  //
  // Vendors sign up together on the park wifi and phones share a carrier
  // gateway, so a whole group can arrive from one address. A tight per address
  // limit turns that into rejected vendors. This one is a flood ceiling only:
  // loose enough that a real crowd never touches it, tight enough to stop a
  // script. The per vendor limit further down does the actual work.
  const ipLimit = rateLimit(`vendor-ip:${ip}`, 30, 10 * 60 * 1000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many applications from this connection. Give it a few minutes and go again.' },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
    );
  }

  // The form posts multipart so the uploads travel with it. JSON is still
  // accepted so anything already integrated against this route keeps working.
  let body: Payload;
  let form: FormData | null = null;

  const contentType = request.headers.get('content-type') || '';

  try {
    if (contentType.includes('multipart/form-data')) {
      form = await request.formData();
      body = fieldsFromFormData(form);
    } else {
      body = (await request.json()) as Payload;
    }
  } catch (err) {
    // A body that cannot be parsed is usually one that was cut off part way,
    // which is what a slow upload on a phone looks like from here.
    logFailure('parse', { contentType: contentType.split(';')[0] }, err);
    return bad(
      'Your submission did not arrive in full, which usually means the upload was cut off. Check your signal and try again.',
      400
    );
  }

  const shape = uploadShape(form);

  const { errors, value } = validate(body);
  if (errors.length) {
    logFailure('validation', { firstError: errors[0], errorCount: errors.length, ...shape });
    return bad(errors[0]);
  }

  // Per vendor limit, keyed on the email rather than the address, so one person
  // hammering submit is slowed down without touching anyone else on the same
  // wifi. Applied after validation so a junk request cannot burn someone
  // else's allowance by naming their address.
  const personLimit = rateLimit(`vendor-email:${value.email}`, 5, 10 * 60 * 1000);
  if (!personLimit.ok) {
    logFailure('rate-limit', { scope: 'email' });
    return NextResponse.json(
      { ok: false, error: 'You have sent this a few times already. Give it a few minutes and go again.' },
      { status: 429, headers: { 'Retry-After': String(personLimit.retryAfterSeconds) } }
    );
  }

  // Signup cutoff and capacity. Enforced here, not just hidden in the UI, so a
  // stale page or a direct post cannot slip in after the deadline or into an
  // event that filled up while the form was open.
  //
  // The deadline comes from the schedule rather than the compiled calendar, so
  // a cutoff moved in the events table is honoured by the server too and not
  // only by the countdown.
  /* What the vendor is buying decides which gate applies. An event has a
     deadline and a waitlist; an ordinary day has the availability calendar; a
     permanent spot has neither, because it is not tied to a date at all. */
  let event: Awaited<ReturnType<typeof getScheduledEvent>> = null;
  let bookingLabel = '';

  if (value.booking_kind === 'event') {
    event = await getScheduledEvent(value.event_slug ?? '');
    if (!event || !event.isPublished) {
      return bad('Pick an event.');
    }
    if (event.deadlinePassed) {
      logFailure('deadline', { eventSlug: event.slug });
      return bad(
        `Signup for ${event.name} closed on ${event.signupClosesDisplay} Central. Join the waitlist and we will contact you if a spot opens.`,
        409
      );
    }
    if (event.isFull === true) {
      logFailure('full', { eventSlug: event.slug });
      return bad(
        `${event.name} is full. Join the waitlist and we will contact you if a spot opens.`,
        409
      );
    }

    /* Per type, because the event as a whole having room says nothing about the
       type this vendor asked for. Booths can be taking applications while the
       trucks are done, and refusing both would send away business there is
       space for. This is the gate that stops a payment being taken for a queue
       that is already deeper than it is worth reviewing. */
    const slot = reviewSlotFor(await getSpots(event.slug), value.spot_type);
    if (!slot.open) {
      logFailure('full', { eventSlug: event.slug, spotType: value.spot_type, reason: 'no review slots' });
      return bad(
        `We have taken all the ${value.spot_type === 'truck' ? 'food truck' : 'booth'} applications we can review for ${event.name}. Join the waitlist and we will contact you if a spot opens.`,
        409
      );
    }

    bookingLabel = event.name;
  } else if (value.booking_kind === 'day') {
    const day = value.booking_date as string;
    const status = await getDayStatus(day);

    if (!status.bookable) {
      logFailure('day-unavailable', { day, reason: status.reason });
      return bad(dayRefusal(status), 409);
    }
    if (!canBook(status, value.spot_type)) {
      logFailure('day-unavailable', { day, reason: 'no review slots', spotType: value.spot_type });
      return bad(
        `We have taken all the ${value.spot_type === 'truck' ? 'food truck' : 'booth'} applications we can review for ${formatDayLong(day)}. Pick another date, or email us to go on the list for this one.`,
        409
      );
    }
    bookingLabel = formatDayLong(day);
  } else {
    // Monthly. Capacity is checked against the permanent holders rather than
    // against any one date, because the spot is held every day.
    if (!isSubscriptionsConfigured()) {
      logFailure('subscription-config', { spotType: value.spot_type });
      return bad(
        'Monthly spots are not connected yet. Email us and we will set one up for you.',
        503
      );
    }

    const room = await monthlyRoomFor(value.spot_type);
    if (!room.available) {
      logFailure('full', { kind: 'monthly', spotType: value.spot_type });
      return bad(
        `Every permanent ${value.spot_type === 'truck' ? 'truck' : 'booth'} spot is taken right now. Email us and we will put you next in line.`,
        409
      );
    }
    bookingLabel = MONTHLY_PRICING[value.spot_type as MonthlySpot].label;
  }

  // Validate uploads before writing anything, so a bad file does not leave a
  // half finished application behind.
  let permitUpload: ValidatedUpload | null = null;
  let mediaUploads: ValidatedUpload[] = [];
  const uploadIssues: string[] = [];

  if (form) {
    try {
      const collected = await collectUploads(form, value.spot_type, value.serves_food);
      permitUpload = collected.permit;
      mediaUploads = collected.media;
      uploadIssues.push(...collected.issues);
    } catch (err) {
      logFailure('upload-validation', { spotType: value.spot_type, ...shape }, err);
      if (err instanceof UploadError) return bad(err.message, 422);
      return bad(
        'We could not read one of your files. Try a different photo, or submit without it and email it to us.',
        400
      );
    }
  } else if (value.spot_type === 'truck' || value.serves_food) {
    logFailure('upload-validation', { reason: 'no multipart body', spotType: value.spot_type });
    return bad(
      'Food trucks must upload a Texas DSHS health permit, and anyone serving food must upload their permit. Add yours and submit again.',
      422
    );
  }

  if (!isSupabaseConfigured()) {
    logFailure('db-config', {});
    return bad('The application form is not connected yet. Email us and we will get you set.', 503);
  }

  const amountCents = priceForBooking(value.booking_kind, value.spot_type);
  if (amountCents === null) {
    return bad('Pick a spot type.');
  }

  const isMonthly = value.booking_kind === 'monthly';
  // A monthly spot is never free and never goes to Square checkout, so the
  // free path is only about the no-charge organisation spots.
  const isFree = amountCents === 0;
  const signedDate = resolveSignedDate(value.signed_date);
  const supabase = getSupabaseAdmin();

  /* The card goes on file before the row is written.
     A stored card with no application behind it is an orphan Square customer,
     which is untidy. An application whose card failed is worse: it would sit in
     the review queue looking ready to approve, and approving it would try to
     start a subscription against nothing. So the card is proved first and the
     row is only written once there is something real to bill. Nothing is
     charged here; the subscription starts on approval. */
  let storedCard: { customerId: string; cardId: string } | null = null;

  if (isMonthly) {
    const card = await storeCardOnFile({
      sourceId: value.card_source_id,
      verificationToken: value.card_verification_token || undefined,
      businessName: value.business_name,
      contactName: value.contact_name,
      email: value.email,
      phone: value.phone,
      // Random rather than the row id, because the row does not exist yet.
      reference: randomUUID(),
    });

    if (!card.ok) {
      logFailure('subscription', { stage: 'card-on-file' });
      return bad(card.error, 402);
    }

    storedCard = { customerId: card.value.customerId, cardId: card.value.cardId };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('vendor_applications')
    .insert({
      business_name: value.business_name,
      contact_name: value.contact_name,
      phone: value.phone,
      email: value.email,
      spot_type: value.spot_type,
      event_slug: value.event_slug,
      booking_kind: value.booking_kind,
      booking_date: value.booking_date,
      sells: value.sells,
      notes: value.notes,

      // Signed agreement record. Version is stamped server side from the constant
      // this deployment actually rendered, never from the client payload.
      waiver_accepted: true,
      permits_confirmed: true,
      signature_name: value.signature_name,
      signed_date: signedDate,
      signed_at: new Date().toISOString(),
      agreement_version: AGREEMENT_VERSION,
      signer_ip: ip,
      signer_user_agent: userAgent,
      serves_food: value.serves_food,

      amount_cents: amountCents,
      /* A monthly row stays 'unpaid' until Square's first invoice settles.
         Nothing has been taken: the card is authorised and held, which is what
         the vendor was told would happen, and the charge only follows an
         approval. Capacity for a permanent spot is counted off the booking kind
         and the review decision rather than off this column, so holding it at
         unpaid does not hand the space back. */
      payment_status: isFree ? 'not_required' : 'unpaid',
      payment_method: 'online',

      ...(isMonthly
        ? {
            monthly_amount_cents: amountCents,
            recurring_acknowledged: true,
            square_customer_id: storedCard?.customerId ?? null,
            square_card_id: storedCard?.cardId ?? null,
            // 'pending' here is the subscription, not the review: it has not
            // been created with Square yet and will not be until approval.
            subscription_status: 'pending',
          }
        : {}),
      /* Everyone goes through review, including the free Alice organisation
         spots. They used to be approved on submission because there was no
         payment to wait on, but the queue is about who sets up on the lot, not
         about who has paid, and an org that is never reviewable cannot be
         turned down. Denying one simply has nothing to refund. */
      approval_status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    logFailure('db-insert', shape, insertError);
    return bad(
      'We could not save your application. Nothing was charged. Try again, and email us if it happens twice.',
      500
    );
  }

  // The counts on the front page changed. A day or monthly booking is not
  // scoped to one event, and a monthly one moves every event's meter, so those
  // clear the whole cache rather than one slug.
  invalidateSpots(value.booking_kind === 'event' ? value.event_slug ?? undefined : undefined);

  // Store the files under the application id. Uploading after the insert keeps
  // the keys tied to a real row rather than leaving orphaned objects behind.
  //
  // The permit and the media are handled differently on purpose. A permit is a
  // regulatory document and the spot is not valid without it, so if it fails to
  // store the vendor is told and checkout does not start. Logos and photos are
  // promotional: a failure is recorded on the row and the application, the
  // signed agreement and the payment all still go through.
  const paths: {
    logo_path?: string;
    permit_path?: string;
    photo_paths?: string[];
    upload_issues?: string | null;
  } = {};

  if (permitUpload) {
    try {
      paths.permit_path = await storeUpload(permitUpload, inserted.id);
    } catch (err) {
      logFailure('upload-storage', { file: 'permit', applicationId: inserted.id, ...shape }, err);

      // Leave a trail on the row rather than deleting it. The signature record
      // is auditable and the schema says never to delete these, so the
      // application stays visible in the tracker as unpaid with no permit.
      const { error: noteError } = await supabase
        .from('vendor_applications')
        .update({
          admin_notes:
            'Health permit upload failed at submission. Vendor was told to try again. No payment was taken.',
        })
        .eq('id', inserted.id);

      if (noteError) logFailure('upload-record', { applicationId: inserted.id }, noteError);

      return bad(
        'We could not save your health permit, so we did not take a payment. Try again in a minute, and email us if it keeps failing.',
        502
      );
    }
  }

  // Promotional media. A failure here is recorded and never stops the vendor.
  const photoPaths: string[] = [];
  let photoIndex = 0;

  for (const upload of mediaUploads) {
    try {
      const path = await storeUpload(upload, inserted.id, photoIndex);
      if (upload.kind === 'logo') paths.logo_path = path;
      else {
        photoPaths.push(path);
        photoIndex += 1;
      }
    } catch (err) {
      logFailure('upload-storage', { file: upload.kind, applicationId: inserted.id }, err);
      uploadIssues.push(`${upload.kind} failed to store`);
    }
  }

  if (photoPaths.length) paths.photo_paths = photoPaths;
  if (uploadIssues.length) paths.upload_issues = uploadIssues.join('; ');

  if (Object.keys(paths).length) {
    const { error: pathError } = await supabase
      .from('vendor_applications')
      .update(paths)
      .eq('id', inserted.id);

    // A permit that stored but whose path did not record is the same problem as
    // one that never stored, so it stops checkout too.
    if (pathError) {
      logFailure('upload-record', { applicationId: inserted.id }, pathError);
      if (paths.permit_path) {
        return bad(
          'We could not save your health permit, so we did not take a payment. Try again in a minute, and email us if it keeps failing.',
          502
        );
      }
    }
  }

  /* Everything the review emails need about this application, whichever kind
     it is. event_name carries whatever the vendor actually booked: an event
     name, a date, or the permanent spot, so one template reads correctly for
     all three without branching on the kind. */
  const emailShape = {
    id: inserted.id,
    business_name: value.business_name,
    contact_name: value.contact_name,
    phone: value.phone,
    email: value.email,
    spot_type: value.spot_type,
    event_slug: value.event_slug ?? '',
    event_name: bookingLabel,
    sells: value.sells,
    notes: value.notes,
    serves_food: value.serves_food,
    permit_uploaded: Boolean(paths.permit_path),
    signature_name: value.signature_name,
    signed_at: new Date().toISOString(),
    agreement_version: AGREEMENT_VERSION,
    amount_cents: amountCents,
    booking_kind: value.booking_kind,
    booking_when:
      value.booking_kind === 'day' && value.booking_date
        ? formatDayLong(value.booking_date)
        : value.booking_kind === 'monthly'
          ? 'every day, until you cancel'
          : undefined,
  };

  /* A permanent spot takes no payment now. The card is on file, the
     subscription starts on approval, and until then this is an application like
     any other sitting in the queue. */
  if (isMonthly) {
    await notifyPaymentReceived({
      ...emailShape,
      payment_status: 'unpaid',
      payment_method: 'online',
    });

    return NextResponse.json({ ok: true, id: inserted.id, checkoutUrl: null });
  }

  // Alice organizations set up at no charge, so they skip checkout.
  //
  // There is no payment to wait on, so they join the review queue right here.
  // A paying vendor joins it from the Square webhook instead, once the money
  // actually settles.
  if (isFree) {
    await notifyPaymentReceived({
      ...emailShape,
      payment_status: 'not_required',
      payment_method: 'online',
    });

    return NextResponse.json({ ok: true, id: inserted.id, checkoutUrl: null });
  }

  if (!isSquareConfigured()) {
    return bad('Payment is not connected yet. Email us and we will get you set.', 503);
  }


  const spotLabel = value.spot_type === 'truck' ? PRICING.truck.label : PRICING.booth.label;

  // The owner is told the moment the form is submitted, before checkout, so
  // every attempt is visible and an abandoned one is not silent. The vendor
  // deliberately gets nothing here; their confirmation waits for the payment to
  // actually land, because telling someone their spot is confirmed before they
  // have paid would be wrong.
  await notifyRegistrationStarted({
    ...emailShape,
    payment_status: 'unpaid',
    payment_method: 'online',
  });

  try {
    const square = getSquare();
    const locationId = getSquareLocationId();

    // A full order rather than quickPay, because only an order carries
    // referenceId. That id is the application UUID and it is how the webhook
    // maps a completed payment back to the right row.
    const response = await square.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      description: `${spotLabel} at Coyoteville`,
      order: {
        locationId,
        referenceId: inserted.id,
        lineItems: [
          {
            // bookingLabel is the event name or the date, whichever this is, so
            // the Square receipt names the thing the vendor actually bought.
            name: `${spotLabel}, ${bookingLabel || 'Coyoteville'}`,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(amountCents),
              currency: 'USD',
            },
            note: `${event ? event.displayDate : bookingLabel} at Coyoteville, 150 N. Stadium Road, Alice TX.`.trim(),
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: `${SITE_URL}/vendors/confirmed?spot=${value.spot_type}`,
        askForShippingAddress: false,
        allowTipping: false,
      },
      prePopulatedData: {
        buyerEmail: value.email,
      },
      paymentNote: `Coyoteville vendor spot, application ${inserted.id}`,
    });

    const paymentLink = response.paymentLink;
    const checkoutUrl = paymentLink?.url || paymentLink?.longUrl || null;

    if (!checkoutUrl) {
      throw new Error('Square returned no payment link URL.');
    }

    await supabase
      .from('vendor_applications')
      .update({
        square_order_id: paymentLink?.orderId ?? null,
        square_payment_link_id: paymentLink?.id ?? null,
      })
      .eq('id', inserted.id);

    return NextResponse.json({ ok: true, id: inserted.id, checkoutUrl });
  } catch (err) {
    logFailure('square', { applicationId: inserted.id, amountCents }, err);
    // The application is saved. Only the payment handoff failed.
    return bad(
      'We saved your application and your signed agreement, but our payment provider did not respond. Nothing was charged. Email us and we will send you a payment link.',
      502
    );
  }
}
