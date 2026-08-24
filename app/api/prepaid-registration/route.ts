import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { AGREEMENT_VERSION } from '@/components/VendorAgreement';
import { EVENTS, priceForSpot } from '@/lib/seo';
import { checkPrepaidGate, tokenMatches } from '@/lib/prepaid';
import { invalidateSpots } from '@/lib/spots';
import { MAX_PHOTOS, UploadError, storeUpload, validateUpload, type ValidatedUpload } from '@/lib/uploads';
import { notifyRegistration } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveSignedDate(clientDate: string): string {
  const now = new Date();
  const serverISO = now.toISOString().slice(0, 10);
  if (!DATE_RE.test(clientDate)) return serverISO;
  const parsed = Date.parse(`${clientDate}T12:00:00Z`);
  if (Number.isNaN(parsed)) return serverISO;
  return Math.abs(parsed - now.getTime()) / 86_400_000 <= 2 ? clientDate : serverISO;
}

/**
 * Prepaid vendor registration.
 *
 * Same fields, same agreement and same uploads as the public application. The
 * difference is that no payment is taken: the fee was settled off the site, so
 * the row lands as paid, offline and approved.
 *
 * Every gate is re-checked here. The page decides what to render, this decides
 * what is accepted, and a stale tab or a direct post gets neither.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || 'unknown';

  const limit = rateLimit(`prepaid:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many tries. Give it a few minutes and go again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return bad('We could not read that submission.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('We could not read that submission.');
  }

  // The link is the credential, so it is verified again here rather than
  // trusted because the page rendered.
  if (!tokenMatches(str(form.get('prepaid_token')))) {
    return bad('This registration link is not valid.', 403);
  }

  const business_name = str(form.get('business_name'));
  const contact_name = str(form.get('contact_name'));
  const phone = str(form.get('phone'));
  const email = str(form.get('email')).toLowerCase();
  const spot_type = str(form.get('spot_type'));
  const event_slug = str(form.get('event_slug'));
  const sells = str(form.get('sells'));
  const notes = str(form.get('notes'));
  const signature_name = str(form.get('signature_name'));
  const serves_food = str(form.get('serves_food')) === 'true';
  const accepted = str(form.get('waiver_accepted')) === 'true';
  const permits_confirmed = str(form.get('permits_confirmed')) === 'true';

  const errors: string[] = [];
  if (business_name.length < 2 || business_name.length > 120) errors.push('Give us your business name.');
  if (contact_name.length < 2 || contact_name.length > 120) errors.push('Give us a contact name.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) errors.push('That phone number does not look right.');
  if (!EMAIL_RE.test(email) || email.length > 180) errors.push('That email does not look right.');
  if (!['booth', 'truck', 'free'].includes(spot_type)) errors.push('Pick a spot type.');
  if (!EVENTS.some((e) => e.slug === event_slug)) errors.push('Pick an event.');
  if (sells.length < 2 || sells.length > 300) errors.push('Tell us what you sell.');
  if (notes.length > 2000) errors.push('Trim the notes down a little.');
  if (!accepted) errors.push('You have to agree to the Vendor Participation Agreement before we can register you.');
  if (!permits_confirmed) errors.push('You have to confirm you carry your own permits and insurance.');
  if (signature_name.length < 2 || signature_name.length > 120) {
    errors.push('Type your full name in the signature field to sign.');
  }
  if (errors.length) return bad(errors[0]);

  const event = EVENTS.find((e) => e.slug === event_slug)!;

  // Expiry and cap. Checked here, not just on the page.
  const gate = await checkPrepaidGate(event_slug);
  if (!gate.open) {
    const message =
      gate.reason === 'expired'
        ? 'This registration link has expired. Email us and we will sort your spot out directly.'
        : gate.reason === 'full'
          ? 'Every prepaid spot for this event has been registered.'
          : 'This registration link is not available right now. Email us and we will get you registered.';
    return bad(message, 409);
  }

  if (!isSupabaseConfigured()) {
    return bad('Registration is not connected yet. Email us and we will get you set.', 503);
  }

  // Validate every file before anything is written.
  let uploads: ValidatedUpload[] = [];
  try {
    const logo = form.get('logo');
    if (logo instanceof File && logo.size > 0) {
      uploads.push(await validateUpload(logo, 'logo', 'Your logo'));
    }

    const photos = form.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
    if (photos.length > MAX_PHOTOS) throw new UploadError(`Pick at most ${MAX_PHOTOS} photos.`);
    for (const [i, photo] of photos.entries()) {
      uploads.push(await validateUpload(photo, 'photo', `Photo ${i + 1}`));
    }

    const permit = form.get('permit');
    if (permit instanceof File && permit.size > 0) {
      uploads.push(await validateUpload(permit, 'permit', 'Your food handler permit'));
    } else if (spot_type === 'truck' || serves_food) {
      throw new UploadError(
        'A food handler permit is required for food trucks and for anyone serving food.'
      );
    }
  } catch (err) {
    if (err instanceof UploadError) return bad(err.message, 422);
    console.error('prepaid upload validation failed', err);
    return bad('We could not read one of your files. Try again.', 400);
  }

  // The row id is generated up front so the files can be stored under it before
  // the insert. If a file fails, nothing has been written and nothing has been
  // decremented, so the vendor can simply try again.
  const applicationId = randomUUID();

  let logoPath: string | null = null;
  let permitPath: string | null = null;
  const photoPaths: string[] = [];

  try {
    let photoIndex = 0;
    for (const upload of uploads) {
      const path = await storeUpload(upload, applicationId, photoIndex);
      if (upload.kind === 'logo') logoPath = path;
      else if (upload.kind === 'permit') permitPath = path;
      else {
        photoPaths.push(path);
        photoIndex += 1;
      }
    }
  } catch (err) {
    console.error('prepaid upload storage failed', err);
    return bad('We could not save your files, so nothing was registered. Try again in a minute.', 502);
  }

  const amountCents = priceForSpot(spot_type) ?? 0;
  const signedDate = resolveSignedDate(str(form.get('signed_date')));

  // The insert and the offline decrement happen inside one database function,
  // so they share a transaction and the meter can never double count.
  const supabase = getSupabaseAdmin();
  const { data: newId, error } = await supabase.rpc('register_prepaid_vendor', {
    payload: {
      id: applicationId,
      business_name,
      contact_name,
      phone,
      email,
      spot_type,
      event_slug,
      sells,
      notes: notes || null,
      signature_name,
      signed_date: signedDate,
      agreement_version: AGREEMENT_VERSION,
      signer_ip: ip,
      signer_user_agent: userAgent,
      serves_food,
      logo_path: logoPath,
      photo_paths: photoPaths,
      permit_path: permitPath,
      amount_cents: amountCents,
      admin_notes: 'Registered through the prepaid link. Paid outside the website, no Square charge.',
    },
  });

  if (error) {
    console.error('prepaid registration insert failed', error);
    return bad('We could not save that. Try again in a minute.', 500);
  }

  invalidateSpots(event_slug);

  // Email is a side effect of a completed registration and must never be able
  // to fail one. notifyRegistration swallows its own errors.
  await notifyRegistration({
    id: String(newId ?? applicationId),
    business_name,
    contact_name,
    phone,
    email,
    spot_type,
    event_slug,
    event_name: event.name,
    sells,
    notes: notes || null,
    serves_food,
    permit_uploaded: Boolean(permitPath),
    signature_name,
    signed_at: new Date().toISOString(),
    agreement_version: AGREEMENT_VERSION,
    amount_cents: amountCents,
    payment_status: 'paid',
    payment_method: 'offline',
  });

  return NextResponse.json({ ok: true, id: newId ?? applicationId, checkoutUrl: null });
}
