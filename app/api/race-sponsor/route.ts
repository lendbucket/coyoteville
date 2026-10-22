import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isSquareConfigured } from '@/lib/square';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { MEDIA_BUCKET, UploadError, storeUpload, validateUpload } from '@/lib/uploads';
import { sponsorLevelById } from '@/lib/race-sponsorship';
import { SPONSORSHIP_VERSION } from '@/lib/race-sponsorship/current';
import { availabilityFor, SPONSOR_LEVELS } from '@/lib/race-sponsorship';
import { getRace, getSponsorStanding } from '@/lib/races';
import { createRacePaymentLink, raceSponsorReferenceId } from '@/lib/race-payment-link';
import { sendRaceAlert } from '@/lib/race-alert';
import { dollars } from '@/lib/race';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A logo is a small file. Enough for a generous PNG and nothing like a video. */
export const maxDuration = 60;

/**
 * One sponsorship.
 *
 * Writes the race_sponsors row first and takes the money second, the same way
 * every other paid path on this site works: the row is the record that somebody
 * committed, and a payment link that fails has to leave a row Robert can chase
 * rather than nothing at all.
 *
 * published_at is deliberately not set here. Paying is between the sponsor and
 * Square; putting a logo on a public page is a decision Robert makes in the
 * tracker. The two are separate and the column is how.
 */

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function str(form: FormData, key: string, max = 200): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = rateLimit(`sponsor:${ip}`, 8, 60_000);
  if (!limit.ok) return bad('Too many attempts. Wait a minute and try again.', 429);

  if (!isSupabaseConfigured()) {
    return bad('Sponsorship is not connected yet. Email us and we will sort it.', 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('We could not read that.');
  }

  const raceSlug = str(form, 'race_slug', 80);
  const race = await getRace(raceSlug);
  if (!race) return bad('That race is not taking sponsorships.', 404);

  const levelId = str(form, 'level', 40);
  const level = sponsorLevelById(levelId);
  if (!level) return bad('Pick a level.');

  /* Checked against what is paid for, now, rather than against what the page
     said when it was rendered. A level that sold while somebody was filling in
     the form is a level that is gone, and selling the same title sponsorship
     twice is the one mistake this page cannot make. */
  const standing = await getSponsorStanding(race.slug);
  const availability = availabilityFor(SPONSOR_LEVELS, standing.takenByLevel);
  const slot = availability.find((a) => a.level.id === level.id);

  if (!slot || slot.soldOut) {
    return bad(`${level.name} has just been taken. Pick another level.`, 409);
  }

  const businessName = str(form, 'business_name', 160);
  const contactName = str(form, 'contact_name', 120);
  const email = str(form, 'email', 180).toLowerCase();
  const phone = str(form, 'phone', 32);
  const website = str(form, 'website', 300);
  const placementNotes = str(form, 'placement_notes', 600);
  const signatureName = str(form, 'signature_name', 120);
  const accepted = str(form, 'agreement_accepted', 10) === 'true';
  const agreementVersion = str(form, 'agreement_version', 60) || SPONSORSHIP_VERSION;

  if (!businessName) return bad('Give us the business name.');
  if (!contactName) return bad('Give us a contact name.');
  if (!EMAIL_RE.test(email)) return bad('That email does not look right.');
  if (phone.replace(/\D/g, '').length < 10) return bad('That phone number does not look right.');
  if (!accepted) return bad('The agreement has to be accepted.');
  if (!signatureName) return bad('Type your name to accept the agreement.');

  const sponsorId = randomUUID();

  /* The logo, if they sent one. Optional at this step: a business committing on
     a phone at a counter should be able to, and the agreement says when the
     artwork is actually needed. Through the same validator and the same bucket
     as a vendor's logo, so there is one answer to what a logo may be. */
  let logoPath: string | null = null;
  const file = form.get('logo');

  if (file instanceof File && file.size > 0) {
    try {
      const validated = await validateUpload(file, 'logo', 'Your logo');
      logoPath = await storeUpload(validated, sponsorId);
    } catch (err) {
      if (err instanceof UploadError) return bad(err.message);
      console.error('[sponsor] logo upload failed', err);
      return bad('We could not save that logo. Try again, or send it to us later.');
    }
  }

  /* The agreement acceptance goes in placement_notes alongside anything they
     typed. There is no column for it on race_sponsors and the schema is fixed,
     so it is recorded as text rather than not recorded: a business that
     committed fifteen hundred dollars is entitled to a record of which version
     it accepted and when. */
  const acceptance =
    `Accepted ${agreementVersion} as "${signatureName}" on ` +
    `${new Date().toISOString()} from ${ip}.`;

  const notes = [placementNotes, acceptance].filter(Boolean).join('\n\n');

  const { error } = await getSupabaseAdmin().from('race_sponsors').insert({
    id: sponsorId,
    race_slug: race.slug,
    level: level.id,
    business_name: businessName,
    contact_name: contactName,
    email,
    phone,
    website: website || null,
    logo_path: logoPath,
    amount_cents: level.cents,
    payment_status: 'unpaid',
    placement_notes: notes,
  });

  if (error) {
    console.error('[sponsor] insert failed', error);
    return bad('We could not save that. Try again in a minute.', 500);
  }

  /* Fired after the row exists, never awaited, wrapped twice. */
  try {
    void sendRaceAlert({
      stage: 'created',
      raceName: race.name,
      what: `Sponsorship, ${level.name}`,
      leadName: businessName,
      email,
      phone,
      runners: [],
      amountCents: level.cents,
      paymentStatus: 'unpaid, in checkout',
      taken: standing.count + 1,
      capacity: 0,
    }).catch((err) => console.error('sponsor alert failed', err));
  } catch (err) {
    console.error('sponsor alert could not be started', err);
  }

  if (!isSquareConfigured()) {
    return bad('Payment is not connected yet. Email us and we will invoice you.', 503);
  }

  try {
    const checkoutUrl = await createRacePaymentLink({
      referenceId: raceSponsorReferenceId(race.slug, sponsorId),
      amountCents: level.cents,
      lineName: `${level.name}, ${race.name}`,
      note: `${race.name}, ${race.displayDate}. ${level.name} sponsorship, ${dollars(level.cents)}.`,
      buyerEmail: email,
      redirectPath: '/turkey-trot/sponsors/thanks',
    });

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (err) {
    console.error('[sponsor] payment link failed', err);
    /* The row is saved. Saying it failed is how a business commits twice. */
    return NextResponse.json({
      ok: true,
      checkoutUrl: null,
      error: 'You are down for it, but we could not open checkout. We will email you a link.',
    });
  }
}
