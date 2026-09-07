import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { storeUpload, validateUpload, UploadError } from '@/lib/uploads';
import { getEvents } from '@/lib/events-source';
import {
  ORG_TYPES,
  PAYOUT_WINDOW_DAYS,
  PROGRAM_NAME,
  TERMS_VERSION,
  VOLUNTEER_MINIMUM,
} from '@/lib/parking-fundraiser';
import { renderOrgConfirmation, renderOrgNotification } from '@/lib/email/org-application';
import { sendReminderEmail } from '@/lib/notify';
import { supportEmail } from '@/lib/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * An organization applying to work a home game.
 *
 * Same shape as the vendor application and for the same reasons: validated on
 * the server rather than trusted from the form, rate limited, files stored
 * through the server into a private bucket, and the signature captured with the
 * terms version, the time, the IP and the user agent.
 *
 * The signature block is not decoration. An organization is agreeing to bring
 * people to a specific place on a specific night and to forfeit its share if it
 * does not, and a record of who agreed to which version of that, and when, is
 * the thing that makes the forfeit rule fair rather than arbitrary.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return bad('The application form is not connected yet. Email us and we will get you set.', 503);
  }

  const ip = getClientIp(request.headers);
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 400);

  const limit = rateLimit(`org-application:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'You have sent this a few times already. Give it a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('Your application did not arrive in full. Check your signal and try again.');
  }

  const str = (k: string) => String(form.get(k) ?? '').trim();

  const org_name = str('org_name');
  const org_type = str('org_type');
  const contact_name = str('contact_name');
  const email = str('email').toLowerCase();
  const phone = str('phone');
  const ein = str('ein');
  const story = str('story');
  const signature_name = str('signature_name');
  const is_501c3 = form.get('is_501c3') === 'true';
  const terms_accepted = form.get('terms_accepted') === 'true';
  const volunteer_count = Number(str('volunteer_count'));
  const event_slugs = form.getAll('event_slugs').map((v) => String(v));

  const errors: string[] = [];

  if (org_name.length < 2 || org_name.length > 160) errors.push('Give us your organization name.');
  if (!ORG_TYPES.includes(org_type as (typeof ORG_TYPES)[number])) errors.push('Pick what kind of organization you are.');
  if (contact_name.length < 2 || contact_name.length > 120) errors.push('Give us a contact name.');
  if (!EMAIL_RE.test(email) || email.length > 180) errors.push('That email does not look right.');

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) errors.push('That phone number does not look right.');

  if (!Number.isFinite(volunteer_count) || volunteer_count < VOLUNTEER_MINIMUM) {
    errors.push(`You need at least ${VOLUNTEER_MINIMUM} adults to work a game.`);
  }
  if (volunteer_count > 200) errors.push('That is more volunteers than we can place. Call us instead.');

  if (story.length < 10 || story.length > 1200) {
    errors.push('Tell us briefly what the money would do for your organization.');
  }
  if (ein && !/^\d{2}-?\d{7}$/.test(ein)) errors.push('That EIN does not look right. Leave it blank if you do not have one.');

  /* Which games they can work, checked against the events table rather than
     trusted, so a hand rolled post cannot enter a draw for a game that does not
     exist or has already been played. */
  const events = await getEvents();
  const upcoming = new Set(events.filter((e) => Date.parse(e.endISO) > Date.now()).map((e) => e.slug));
  const games = event_slugs.filter((s) => upcoming.has(s));

  if (!games.length) errors.push('Pick at least one game your organization can work.');
  if (!terms_accepted) errors.push('You have to accept the program terms before we can take your application.');
  if (signature_name.length < 2 || signature_name.length > 120) {
    errors.push('Type your full name in the signature field to sign.');
  }

  if (errors.length) return bad(errors[0]);

  const supabase = getSupabaseAdmin();

  const { data: inserted, error: insertError } = await supabase
    .from('org_applications')
    .insert({
      org_name,
      org_type,
      contact_name,
      email,
      phone,
      ein: ein || null,
      is_501c3,
      volunteer_count,
      story,
      event_slugs: games,
      status: 'pending',
      terms_accepted: true,
      /* Stamped server side from the constant this deployment rendered, never
         from the client payload, exactly as the vendor agreement version is. */
      terms_version: TERMS_VERSION,
      signature_name,
      signed_at: new Date().toISOString(),
      signer_ip: ip,
      signer_user_agent: userAgent,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[org-application] insert failed', insertError);
    return bad('We could not save your application. Try again, and email us if it happens twice.', 500);
  }

  /* The logo is optional and never blocks the application. It is stored after
     the insert so the file is keyed to a row that exists. */
  const logo = form.get('logo');
  if (logo instanceof File && logo.size > 0) {
    try {
      const path = await storeUpload(await validateUpload(logo, 'logo', 'Your logo'), inserted.id);
      await supabase.from('org_applications').update({ logo_path: path }).eq('id', inserted.id);
    } catch (err) {
      if (!(err instanceof UploadError)) console.error('[org-application] logo failed', err);
    }
  }

  const gameNames = games.map((slug) => {
    const e = events.find((ev) => ev.slug === slug);
    return e ? `${e.name}, ${e.displayDate}` : slug;
  });

  const support = supportEmail();

  await sendReminderEmail(
    email,
    renderOrgConfirmation({
      programName: PROGRAM_NAME,
      orgName: org_name,
      contactName: contact_name,
      volunteerMinimum: VOLUNTEER_MINIMUM,
      payoutWindowDays: PAYOUT_WINDOW_DAYS,
      games: gameNames,
      supportEmail: support,
    })
  ).catch((e) => console.error('[org-application] confirmation failed', e));

  await sendReminderEmail(
    support,
    renderOrgNotification({
      programName: PROGRAM_NAME,
      orgName: org_name,
      orgType: org_type,
      contactName: contact_name,
      email,
      phone,
      volunteerCount: volunteer_count,
      is501c3: is_501c3,
      ein,
      story,
      games: gameNames,
    })
  ).catch((e) => console.error('[org-application] notification failed', e));

  return NextResponse.json({ ok: true, id: inserted.id });
}
