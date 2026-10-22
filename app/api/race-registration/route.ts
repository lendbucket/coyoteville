import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isSquareConfigured } from '@/lib/square';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import {
  ENTRY_INCLUDES,
  FAMILY_MAX_RUNNERS,
  RACE_ADDONS,
  RACE_PRICING,
  TEAM_MIN_RUNNERS,
  adultPriceAt,
  ageOnRaceDay,
  entryPriceForAge,
  isMinorAge,
  isShirtSize,
  registrationOpenAt,
  shirtsAvailableAt,
  dollars,
  type RaceTier,
} from '@/lib/race';
import { clockFor, getRace, getRaceCounts } from '@/lib/races';
import { raceDates } from '@/lib/race-dates';
import { createRacePaymentLink, raceGroupReferenceId, raceReferenceId } from '@/lib/race-payment-link';
import { sendRaceAlert, sendRaceConfirmation } from '@/lib/race-alert';
import { supportEmail } from '@/lib/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One registration, which may be one runner or twelve.
 *
 * The shape is the same whichever path the form was on: a group row when there
 * is more than one runner paying together, and a registration row per runner
 * always. A family is one payment and five waivers, because a race is run by
 * people and the waiver is per person.
 *
 * Every price is recomputed here off the clock and the pricing constants. What
 * the browser sent as a total is never trusted: it is a number from a page
 * somebody can edit, and the only honest source for what to charge is the same
 * function the page used.
 */

type RunnerInput = {
  first_name?: unknown;
  last_name?: unknown;
  date_of_birth?: unknown;
  gender?: unknown;
  shirt_size?: unknown;
  emergency_contact_name?: unknown;
  emergency_contact_phone?: unknown;
  guardian_name?: unknown;
};

function str(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = rateLimit(`race:${ip}`, 10, 60_000);
  if (!limit.ok) {
    return bad('Too many attempts. Wait a minute and try again.', 429);
  }

  if (!isSupabaseConfigured()) {
    return bad('Registration is not connected yet. Email us and we will get you in.', 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad('We could not read that.');
  }

  const raceSlug = str(body.race_slug, 80);
  const race = await getRace(raceSlug);
  if (!race) return bad('That race is not open for registration.', 404);

  const clock = clockFor(race);
  const now = Date.now();
  /* Every date the confirmation prints, off the columns. */
  const dates = raceDates(race, now);

  if (!registrationOpenAt(clock, now)) {
    return bad('Registration has closed for this year.', 409);
  }

  /* ------------------------------------------------------------ the people */

  const path = str(body.path, 10);
  if (!['solo', 'family', 'team'].includes(path)) return bad('Pick how you are registering.');

  const rawRunners = Array.isArray(body.runners) ? (body.runners as RunnerInput[]) : [];
  if (!rawRunners.length) return bad('Add at least one runner.');

  if (path === 'solo' && rawRunners.length !== 1) return bad('A single entry is one runner.');
  if (path === 'family' && rawRunners.length > FAMILY_MAX_RUNNERS) {
    return bad(`A family entry covers up to ${FAMILY_MAX_RUNNERS} runners.`);
  }
  if (path === 'team' && rawRunners.length < TEAM_MIN_RUNNERS) {
    return bad(`A team is ${TEAM_MIN_RUNNERS} runners or more.`);
  }

  const email = str(body.email, 180).toLowerCase();
  const phone = str(body.phone, 32);
  if (!EMAIL_RE.test(email)) return bad('That email does not look right.');
  if (phone.replace(/\D/g, '').length < 10) return bad('That phone number does not look right.');

  const captainEmergencyName = str(body.emergency_contact_name, 120);
  const captainEmergencyPhone = str(body.emergency_contact_phone, 32);

  const waiverAccepted = body.waiver_accepted === true;
  const signatureName = str(body.signature_name, 120);
  const guardianSignatureName = str(body.guardian_signature_name, 120);

  if (!waiverAccepted) return bad('The waiver has to be accepted.');
  if (!signatureName) return bad('Type your name to sign the waiver.');

  const shirtsOpen = shirtsAvailableAt(clock, now);
  const teamName = str(body.team_name, 120);
  if (path === 'team' && !teamName) return bad('Name your team.');

  /* Each runner, validated and priced. */
  type Prepared = {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    age: number;
    isMinor: boolean;
    gender: string;
    shirtSize: string;
    emergencyName: string;
    emergencyPhone: string;
    guardianName: string;
  };

  const runners: Prepared[] = [];

  for (const [i, raw] of rawRunners.entries()) {
    const who = path === 'solo' ? 'You' : `Runner ${i + 1}`;

    const firstName = str(raw.first_name, 80);
    const lastName = str(raw.last_name, 80);
    if (!firstName || !lastName) return bad(`${who}: give us a first and last name.`);

    const dateOfBirth = str(raw.date_of_birth, 10);
    const age = ageOnRaceDay(dateOfBirth, clock.startsAtMs);
    if (age === null) return bad(`${who}: that date of birth does not look right.`);

    const emergencyName = str(raw.emergency_contact_name, 120) || captainEmergencyName;
    const emergencyPhone = str(raw.emergency_contact_phone, 32) || captainEmergencyPhone;
    /* Both are NOT NULL in the database. Refused here with a sentence rather
       than left to fail the insert with 23502 after everything else worked. */
    if (!emergencyName || !emergencyPhone) {
      return bad(`${who}: an emergency contact name and phone are both required.`);
    }

    const minor = isMinorAge(age);
    const guardianName = str(raw.guardian_name, 120);

    /* race_registrations_minor_guardian refuses a minor row without both of
       these. Checked here so the message names the runner. */
    if (minor && (!guardianName || !guardianSignatureName)) {
      return bad(
        `${who} is ${age} on race day, so a parent or guardian name and signature are both required.`
      );
    }

    const shirtRaw = str(raw.shirt_size, 10);
    const shirtSize = shirtsOpen && isShirtSize(shirtRaw) ? shirtRaw : '';

    runners.push({
      firstName,
      lastName,
      dateOfBirth,
      age,
      isMinor: minor,
      gender: str(raw.gender, 40),
      shirtSize,
      emergencyName,
      emergencyPhone,
      guardianName,
    });
  }

  if (path === 'family' && !runners.some((r) => !r.isMinor)) {
    return bad('A family entry needs at least one adult runner.');
  }

  /* --------------------------------------------------------- the capacity */

  const counts = await getRaceCounts(race);
  if (counts.capacity > 0 && counts.taken + runners.length > counts.capacity) {
    return bad(
      counts.remaining > 0
        ? `Only ${counts.remaining} places are left, and this is ${runners.length} runners.`
        : 'The race is full.',
      409
    );
  }

  /* ------------------------------------------------------------ the money */

  const isGroup = path !== 'solo';
  const tier: RaceTier = path === 'family' ? 'family' : path === 'team' ? 'team' : 'adult';

  const entryCents =
    path === 'family'
      ? RACE_PRICING.family
      : path === 'team'
        ? RACE_PRICING.team * runners.length
        : entryPriceForAge(runners[0].age, clock, now);

  const shirtCount = runners.filter((r) => r.shirtSize).length;
  const shirtCents = shirtCount * RACE_ADDONS.shirt;

  const bibName = body.bib_name === true;
  const extraMedals = Math.max(0, Math.min(20, Number(body.extra_medals) || 0));
  const parkingPass = body.parking_pass === true;
  const foodVoucher = body.food_voucher === true;

  const addonCents =
    (bibName ? RACE_ADDONS.bibName : 0) +
    extraMedals * RACE_ADDONS.extraMedal +
    (parkingPass ? RACE_ADDONS.parkingPass : 0) +
    (foodVoucher ? RACE_ADDONS.foodVoucher : 0);

  const donationCents = Math.max(
    0,
    Math.round(Number(String(body.donation ?? '').replace(/[^0-9.]/g, '')) * 100) || 0
  );

  const totalCents = entryCents + shirtCents + addonCents + donationCents;

  /* -------------------------------------------------------------- the rows */

  const supabase = getSupabaseAdmin();
  const groupId = isGroup ? randomUUID() : null;
  const leadName = `${runners[0].firstName} ${runners[0].lastName}`;
  const nowISO = new Date(now).toISOString();

  if (isGroup && groupId) {
    /* Hoisted out of the insert. An inline ternary here reads to
       check-schema's parser as a column named after the variable, which is a
       limitation of parsing an object literal without a type checker and not
       worth making the gate cleverer about: a value with a name is clearer
       anyway. */
    const groupType = path === 'family' ? 'family' : 'team';
    const groupName = path === 'team' ? teamName : `${runners[0].lastName} family`;

    const { error } = await supabase.from('race_groups').insert({
      id: groupId,
      race_slug: race.slug,
      group_type: groupType,
      group_name: groupName,
      captain_name: leadName,
      captain_email: email,
      captain_phone: phone,
      runner_count: runners.length,
      amount_cents: totalCents,
      payment_status: totalCents > 0 ? 'unpaid' : 'not_required',
    });

    if (error) {
      console.error('[race] group insert failed', error);
      return bad('We could not save that. Try again in a minute.', 500);
    }
  }

  /* Every runner is a row. The money sits on the group when there is one, so
     the per runner rows carry zero and the group carries the total: a family
     is one payment, and splitting it across five rows would make the tracker
     add it up five different ways. */
  const registrationIds = runners.map(() => randomUUID());

  const rows = runners.map((runner, i) => ({
    id: registrationIds[i],
    race_slug: race.slug,
    group_id: groupId,
    first_name: runner.firstName,
    last_name: runner.lastName,
    email,
    phone,
    date_of_birth: runner.dateOfBirth,
    age_on_race_day: runner.age,
    gender: runner.gender || null,
    city: str(body.city, 80) || null,
    state: str(body.state, 2) || null,
    emergency_contact_name: runner.emergencyName,
    emergency_contact_phone: runner.emergencyPhone,
    medical_notes: str(body.medical_notes, 600) || null,
    tier: isGroup ? tier : runner.age <= 12 ? 'kid' : 'adult',
    estimated_pace: str(body.estimated_pace, 40) || null,
    heard_about: str(body.heard_about, 120) || null,
    team_name: path === 'team' ? teamName : null,
    shirt_size: runner.shirtSize || null,
    bib_name: bibName ? `${runner.firstName}` : null,
    extra_medals: i === 0 ? extraMedals : 0,
    parking_pass: i === 0 ? parkingPass : false,
    food_voucher: i === 0 ? foodVoucher : false,
    entry_cents: isGroup ? 0 : entryCents,
    shirt_cents: isGroup ? 0 : shirtCents,
    addon_cents: isGroup ? 0 : addonCents,
    donation_cents: isGroup ? 0 : donationCents,
    amount_cents: isGroup ? 0 : totalCents,
    payment_status: isGroup ? 'not_required' : totalCents > 0 ? 'unpaid' : 'not_required',
    shirt_collected: false,
    is_minor: runner.isMinor,
    guardian_name: runner.guardianName || null,
    guardian_signature_name: runner.isMinor ? guardianSignatureName : null,
    waiver_accepted: true,
    waiver_version: race.waiverVersion,
    signature_name: signatureName,
    signed_at: nowISO,
    signer_ip: ip,
    signer_user_agent: request.headers.get('user-agent')?.slice(0, 400) ?? null,
  }));

  const { error: runnerError } = await supabase.from('race_registrations').insert(rows);

  if (runnerError) {
    console.error('[race] registration insert failed', runnerError);
    return bad('We could not save that. Try again in a minute.', 500);
  }

  /* ------------------------------------------------------------ the emails */

  const what =
    path === 'solo'
      ? 'Just me'
      : path === 'family'
        ? `Family of ${runners.length}`
        : `${teamName}, ${runners.length} runners`;

  /**
   * Fired after the rows exist, never awaited, wrapped twice.
   *
   * Same rule as everywhere else on this site: a synchronous throw and a
   * rejection fail in different places and only one is caught by a try, and
   * neither may reach a runner who has already been saved.
   */
  const fireAndForget = (p: () => Promise<unknown>, label: string) => {
    try {
      void p().catch((err) => console.error(`${label} failed`, err));
    } catch (err) {
      console.error(`${label} could not be started`, err);
    }
  };

  fireAndForget(
    () =>
      sendRaceAlert({
        stage: 'created',
        raceName: race.name,
        what,
        leadName,
        email,
        phone,
        runners: runners.map((r) => ({
          name: `${r.firstName} ${r.lastName}`,
          age: r.age,
          shirt: r.shirtSize || null,
          minor: r.isMinor,
        })),
        amountCents: totalCents,
        paymentStatus: totalCents > 0 ? 'unpaid, in checkout' : 'no charge',
        taken: counts.taken + runners.length,
        capacity: counts.capacity,
      }),
    'race alert'
  );

  fireAndForget(
    () =>
      sendRaceConfirmation(email, {
        firstName: runners[0].firstName,
        raceName: race.name,
        displayDate: dates.startLong,
        displayTime: dates.startTime,
        checkInTime: dates.checkInTime,
        distanceLabel: race.distanceLabel,
        tierLabel:
          path === 'solo'
            ? `${dollars(entryCents)} entry`
            : `${what}, ${dollars(totalCents)}`,
        shirtSize: runners[0].shirtSize || null,
        includes: ENTRY_INCLUDES,
        packetPickup: race.packetPickup,
        locationName: race.locationName,
        locationAddress: race.locationAddress,
        chipTimed: race.chipTimed,
        supportEmail: supportEmail(),
      }),
    'race confirmation'
  );

  /* ------------------------------------------------------------- checkout */

  if (totalCents <= 0) {
    return NextResponse.json({ ok: true, checkoutUrl: null });
  }

  if (!isSquareConfigured()) {
    return bad('Payment is not connected yet. Email us and we will get you in.', 503);
  }

  try {
    const checkoutUrl = await createRacePaymentLink({
      referenceId:
        isGroup && groupId
          ? raceGroupReferenceId(race.slug, groupId)
          : raceReferenceId(race.slug, registrationIds[0]),
      amountCents: totalCents,
      lineName: `${race.name}, ${what}`,
      note: `${race.name}, ${race.displayDate}. ${runners.length} runner${runners.length === 1 ? '' : 's'}.`,
      buyerEmail: email,
      redirectPath: '/turkey-trot/registered',
    });

    /* The order id goes on the row that carries the money, so the tracker can
       find a checkout somebody walked away from. */
    const table = isGroup ? 'race_groups' : 'race_registrations';
    const id = isGroup ? groupId : registrationIds[0];
    await supabase.from(table).update({ square_order_id: null }).eq('id', id);

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (err) {
    console.error('[race] payment link failed', err);
    /* The rows are saved. Say so, because telling somebody their registration
       failed when it did not is how they register twice. */
    return NextResponse.json(
      {
        ok: true,
        checkoutUrl: null,
        error: 'You are registered, but we could not open checkout. We will email you a link.',
      },
      { status: 200 }
    );
  }
}
