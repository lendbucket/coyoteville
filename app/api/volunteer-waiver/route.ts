import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getEventBySlug } from '@/lib/events-source';
import { WAIVER_VERSION } from '@/lib/volunteer-waiver/current';
import { isAdultOn, plausibleBirthDate } from '@/lib/volunteer';
import { todayKey } from '@/lib/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * A volunteer signing the waiver at the lot.
 *
 * The same shape as every other public form here: validated on the server
 * rather than trusted from the page, rate limited by IP, and the signature
 * captured with the version, the time, the address and the user agent, exactly
 * as the vendor agreement does it. A waiver whose provenance is not recorded is
 * a piece of text somebody may or may not have read.
 *
 * Two things are deliberately not taken from the form.
 *
 * is_adult is computed here from the date of birth against the event's date. A
 * checkbox saying "I am 18" is a checkbox a sixteen year old ticks in a dark
 * parking lot in ten seconds, and the whole reason the guardian fields exist is
 * to stop that being the site's answer. The form computes the same thing to
 * decide what to show; this computes it again to decide what is true.
 *
 * waiver_version is stamped from the constant this deployment rendered, never
 * from the payload, so a row can never claim to have signed a version that was
 * not on screen.
 *
 * The rate limit is looser than the other forms on purpose. Twenty organization
 * volunteers standing at one table are all on the same phone network and will
 * look like one address, and a limit that locks the eleventh person out is a
 * limit that stops the event rather than an abuse.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return bad('The waiver form is not connected. Tell Coyoteville staff.', 503);
  }

  const ip = getClientIp(request.headers);
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 400);

  const limit = rateLimit(`volunteer-waiver:${ip}`, 40, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'That is a lot of signatures from one connection. Find Coyoteville staff.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('That did not arrive in full. Check your signal and try again.');
  }

  const str = (k: string) => String(form.get(k) ?? '').trim();

  const event_slug = str('event_slug');
  const org_application_id = str('org_application_id');
  const full_name = str('full_name');
  const phone = str('phone');
  const email = str('email').toLowerCase();
  const date_of_birth = str('date_of_birth');
  const guardian_name = str('guardian_name');
  const guardian_phone = str('guardian_phone');
  const guardian_signature_name = str('guardian_signature_name');
  const emergency_contact_name = str('emergency_contact_name');
  const emergency_contact_phone = str('emergency_contact_phone');
  const signature_name = str('signature_name');
  const accepted = form.get('waiver_accepted') === 'true';

  const errors: string[] = [];

  /* The event, checked against the table rather than trusted. A waiver is for
     one night, and a hand rolled post must not be able to file one against a
     game that does not exist or has already been played. */
  const event = await getEventBySlug(event_slug);
  if (!event) errors.push('That link is not for a game we know about. Ask Coyoteville staff.');

  if (full_name.length < 2 || full_name.length > 160) errors.push('Enter your full name.');

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) errors.push('That phone number does not look right.');

  if (email && (!EMAIL_RE.test(email) || email.length > 180)) {
    errors.push('That email does not look right. You can leave it blank.');
  }

  const today = todayKey('America/Chicago');
  if (!plausibleBirthDate(date_of_birth, today)) {
    errors.push('Check your date of birth.');
  }

  if (emergency_contact_name.length < 2 || emergency_contact_name.length > 160) {
    errors.push('Give us an emergency contact name.');
  }
  const emDigits = emergency_contact_phone.replace(/\D/g, '');
  if (emDigits.length < 10 || emDigits.length > 15) {
    errors.push('That emergency contact number does not look right.');
  }

  if (!accepted) errors.push('You have to accept the waiver before you can work.');
  if (signature_name.length < 2 || signature_name.length > 160) {
    errors.push('Type your full name to sign.');
  }

  if (errors.length) return bad(errors[0]);

  /* Computed here, against the date of the game rather than today. Never read
     off the form. */
  const is_adult = isAdultOn(date_of_birth, event!.date);
  if (is_adult === null) return bad('Check your date of birth.');

  if (!is_adult) {
    if (guardian_name.length < 2 || guardian_name.length > 160) {
      errors.push('A parent or guardian has to give their name.');
    }
    const gDigits = guardian_phone.replace(/\D/g, '');
    if (gDigits.length < 10 || gDigits.length > 15) {
      errors.push('That parent or guardian phone number does not look right.');
    }
    if (guardian_signature_name.length < 2 || guardian_signature_name.length > 160) {
      errors.push('A parent or guardian has to type their name to sign.');
    }
    if (errors.length) return bad(errors[0]);
  }

  /* The organization, if the QR carried one. A bad id is dropped rather than
     refused: a signed waiver with no organization against it is still a signed
     waiver, and turning somebody away at the table over a mistyped link would
     be the wrong trade entirely. */
  const org = /^[0-9a-f-]{36}$/i.test(org_application_id) ? org_application_id : null;

  /* The guardian columns are null for an adult, and null is the whole record of
     that: an adult row must not carry a half filled guardian block left behind
     by somebody who mistyped a birth year and corrected it. Worked out here
     rather than inline in the insert, so the insert stays a plain list of
     columns and values. */
  const guardian = is_adult
    ? { name: null, phone: null, signature: null }
    : { name: guardian_name, phone: guardian_phone, signature: guardian_signature_name };

  const supabase = getSupabaseAdmin();

  const { data: inserted, error: insertError } = await supabase
    .from('volunteer_waivers')
    .insert({
      event_slug,
      org_application_id: org,
      full_name,
      phone,
      email: email || null,
      date_of_birth,
      is_adult,
      guardian_name: guardian.name,
      guardian_phone: guardian.phone,
      guardian_signature_name: guardian.signature,
      emergency_contact_name,
      emergency_contact_phone,
      waiver_version: WAIVER_VERSION,
      signature_name,
      signed_at: new Date().toISOString(),
      signer_ip: ip,
      signer_user_agent: userAgent,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[volunteer-waiver] insert failed', insertError);
    return bad('We could not save that. Try once more, then find Coyoteville staff.', 500);
  }

  /* No email. The prompt for this form is somebody standing at a table wanting
     to start work, not somebody who wants a receipt in their inbox, and asking
     for an address to send one to is a field that slows down every signature to
     serve almost nobody. The confirmation is the screen. */
  return NextResponse.json({
    ok: true,
    id: inserted.id,
    isAdult: is_adult,
    eventName: event!.name,
    eventDate: event!.displayDate,
  });
}
