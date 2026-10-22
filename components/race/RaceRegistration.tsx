'use client';

import { useId, useMemo, useState } from 'react';
import {
  ADULT_MIN_AGE,
  FAMILY_MAX_RUNNERS,
  KID_MAX_AGE,
  RACE_ADDONS,
  RACE_PRICING,
  SHIRT_SIZES,
  TEAM_MIN_RUNNERS,
  adultPriceAt,
  ageOnRaceDay,
  dollars,
  entryPriceForAge,
  isMinorAge,
  shirtsAvailableAt,
  type RaceClock,
} from '@/lib/race';
import { RACE_WAIVER, RACE_WAIVER_IS_DRAFT, RACE_WAIVER_VERSION } from '@/lib/race-waiver/current';

/**
 * Registration, three ways.
 *
 * One picker at the top and one form under it, the same shape as the vendor
 * form's booking kind: the alternative is three pages that drift, and this is
 * the one form on the site where the three paths share almost everything.
 *
 * Just me is one runner. My family is one payment for up to five. My team is
 * one payment for ten or more at a per runner rate. In all three, every runner
 * gets their own row, their own waiver and their own bib, because a race is
 * run by people and not by groups.
 */

type Path = 'solo' | 'family' | 'team';

type Runner = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  shirtSize: string;
  /** Defaults to the captain's and is editable per runner. */
  emergencyName: string;
  emergencyPhone: string;
  /** Required by the database for anybody under 18. */
  guardianName: string;
};

function blankRunner(): Runner {
  return {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    shirtSize: '',
    emergencyName: '',
    emergencyPhone: '',
    guardianName: '',
  };
}

const GENDERS = ['Female', 'Male', 'Nonbinary', 'Prefer not to say'];

export default function RaceRegistration({
  raceSlug,
  clock,
  nowMs,
  full,
  remaining,
  closed,
}: {
  raceSlug: string;
  clock: RaceClock;
  /** The server's clock, passed in so the price on screen is the price charged. */
  nowMs: number;
  full: boolean;
  remaining: number;
  closed: boolean;
}) {
  const uid = useId();

  const [path, setPath] = useState<Path>('solo');
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  /* The captain, who is also the only runner on the solo path. */
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('TX');
  const [teamName, setTeamName] = useState('');
  const [pace, setPace] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [medical, setMedical] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [runners, setRunners] = useState<Runner[]>([blankRunner()]);

  /* Add ons. Shirts are per runner; the rest are per registration. */
  const [bibName, setBibName] = useState(false);
  const [extraMedals, setExtraMedals] = useState(0);
  const [parkingPass, setParkingPass] = useState(false);
  const [foodVoucher, setFoodVoucher] = useState(false);
  const [donation, setDonation] = useState('');

  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [signature, setSignature] = useState('');
  const [guardianSignature, setGuardianSignature] = useState('');

  const shirtsOpen = shirtsAvailableAt(clock, nowMs);

  const setRunner = (index: number, patch: Partial<Runner>) => {
    setRunners((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  /* Ages, computed against the race date and not today. Null for a date we
     cannot read, which the submit refuses rather than guessing at. */
  const ages = useMemo(
    () => runners.map((r) => (r.dateOfBirth ? ageOnRaceDay(r.dateOfBirth, clock.startsAtMs) : null)),
    [runners, clock.startsAtMs]
  );

  const anyMinor = ages.some((a) => a !== null && isMinorAge(a));
  const anyAdult = ages.some((a) => a !== null && !isMinorAge(a));

  /**
   * What this will cost, worked out the same way the server will.
   *
   * Shown live because a price that only appears at Square is a price somebody
   * finds out about after they have committed, and because the adult rate moves
   * with the clock and a runner deserves to see which one they are on.
   */
  const quote = useMemo(() => {
    let entry = 0;

    if (path === 'family') {
      entry = RACE_PRICING.family;
    } else if (path === 'team') {
      entry = RACE_PRICING.team * runners.length;
    } else {
      const age = ages[0];
      entry = age === null ? adultPriceAt(clock, nowMs) : entryPriceForAge(age, clock, nowMs);
    }

    const shirts = shirtsOpen
      ? runners.filter((r) => r.shirtSize && r.shirtSize !== 'none').length * RACE_ADDONS.shirt
      : 0;

    const addons =
      (bibName ? RACE_ADDONS.bibName : 0) +
      Math.max(0, extraMedals) * RACE_ADDONS.extraMedal +
      (parkingPass ? RACE_ADDONS.parkingPass : 0) +
      (foodVoucher ? RACE_ADDONS.foodVoucher : 0);

    const gift = Math.max(0, Math.round(Number(donation.replace(/[^0-9.]/g, '')) * 100) || 0);

    return { entry, shirts, addons, gift, total: entry + shirts + addons + gift };
  }, [
    path,
    runners,
    ages,
    clock,
    nowMs,
    shirtsOpen,
    bibName,
    extraMedals,
    parkingPass,
    foodVoucher,
    donation,
  ]);

  /** Everything wrong with the form right now, in the order it appears. */
  const problems = useMemo(() => {
    const out: string[] = [];

    if (!email.trim()) out.push('Give us an email so we can send your confirmation.');
    if (!phone.trim()) out.push('Give us a phone number.');

    if (path === 'team' && !teamName.trim()) out.push('Name your team.');
    if (path === 'team' && runners.length < TEAM_MIN_RUNNERS) {
      out.push(`A team is ${TEAM_MIN_RUNNERS} runners or more. Add ${TEAM_MIN_RUNNERS - runners.length} more.`);
    }
    if (path === 'family' && runners.length > FAMILY_MAX_RUNNERS) {
      out.push(`A family entry covers up to ${FAMILY_MAX_RUNNERS} runners.`);
    }
    if (path === 'family' && runners.length > 0 && !anyAdult && ages.every((a) => a !== null)) {
      out.push('A family entry needs at least one adult runner.');
    }

    runners.forEach((runner, i) => {
      const who = path === 'solo' ? 'You' : `Runner ${i + 1}`;
      if (!runner.firstName.trim() || !runner.lastName.trim()) {
        out.push(`${who}: give us a first and last name.`);
      }
      if (!runner.dateOfBirth) {
        out.push(`${who}: give us a date of birth. It sets the age group and the price.`);
      } else if (ages[i] === null) {
        out.push(`${who}: that date of birth does not look right.`);
      }

      const name = i === 0 ? emergencyName : runner.emergencyName || emergencyName;
      const number = i === 0 ? emergencyPhone : runner.emergencyPhone || emergencyPhone;
      if (!name.trim() || !number.trim()) {
        out.push(`${who}: an emergency contact name and phone are both required.`);
      }

      /* The database refuses a minor row without both guardian fields, so the
         form says so here rather than letting the insert fail with 23514 after
         somebody has filled the whole thing in. */
      const age = ages[i];
      if (age !== null && isMinorAge(age) && !runner.guardianName.trim()) {
        out.push(
          `${who} is ${age} on race day, so a parent or guardian name is required.`
        );
      }
    });

    if (!waiverAccepted) out.push('Read and accept the waiver.');
    if (!signature.trim()) out.push('Type your name to sign.');
    if (anyMinor && !guardianSignature.trim()) {
      out.push('A parent or guardian has to sign separately for any runner under 18.');
    }

    return out;
  }, [
    email,
    phone,
    path,
    teamName,
    runners,
    ages,
    anyAdult,
    anyMinor,
    emergencyName,
    emergencyPhone,
    waiverAccepted,
    signature,
    guardianSignature,
  ]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (problems.length) {
      setError(problems[0]);
      return;
    }

    setStatus('sending');
    setError(null);

    try {
      const res = await fetch('/api/race-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          race_slug: raceSlug,
          path,
          email,
          phone,
          city,
          state,
          team_name: path === 'team' ? teamName : '',
          estimated_pace: pace,
          heard_about: heardAbout,
          medical_notes: medical,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone,
          runners: runners.map((r) => ({
            first_name: r.firstName,
            last_name: r.lastName,
            date_of_birth: r.dateOfBirth,
            gender: r.gender,
            shirt_size: shirtsOpen ? r.shirtSize : '',
            emergency_contact_name: r.emergencyName || emergencyName,
            emergency_contact_phone: r.emergencyPhone || emergencyPhone,
            guardian_name: r.guardianName,
          })),
          bib_name: bibName,
          extra_medals: Math.max(0, extraMedals),
          parking_pass: parkingPass,
          food_voucher: foodVoucher,
          donation: donation,
          waiver_accepted: waiverAccepted,
          waiver_version: RACE_WAIVER_VERSION,
          signature_name: signature,
          guardian_signature_name: guardianSignature,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        checkoutUrl?: string | null;
      };

      if (!res.ok || !data.ok) {
        setStatus('error');
        setError(data.error ?? 'That did not go through. Try again in a minute.');
        return;
      }

      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      window.location.assign('/turkey-trot/registered');
    } catch {
      setStatus('error');
      setError('We could not reach the server. Check your connection and try again.');
    }
  }

  if (closed) {
    return (
      <div className="racereg racereg--shut">
        <h3>Registration is closed</h3>
        <p className="lede">
          Entries for this year have closed. Come down anyway: the park is open from 6:00 AM
          and the trucks will be running.
        </p>
      </div>
    );
  }

  if (full) {
    return (
      <div className="racereg racereg--shut">
        <h3>The race is full</h3>
        <p className="lede">
          Every place has been taken. Email us and we will put you on the list for a place that
          frees up, and tell you first when next year opens.
        </p>
        <p>
          <a className="btn btn--primary" href="mailto:support@coyoteville.com?subject=Turkey%20Trot%20waitlist">
            Join the waitlist
          </a>
        </p>
      </div>
    );
  }

  const maxRunners = path === 'family' ? FAMILY_MAX_RUNNERS : path === 'team' ? 60 : 1;

  return (
    <form className="racereg" onSubmit={onSubmit} noValidate>
      {remaining > 0 && remaining <= 50 ? (
        <p className="racereg__left">{remaining} places left.</p>
      ) : null}

      {/* ---------------------------------------------------- the three paths */}
      <div className="field">
        <span className="label">Who is running</span>
        <div className="kindpick" role="radiogroup" aria-label="Who is running">
          {(
            [
              ['solo', 'Just me', 'One runner'],
              ['family', 'My family', `Up to ${FAMILY_MAX_RUNNERS}, one payment`],
              ['team', 'My team or organization', `${TEAM_MIN_RUNNERS} or more`],
            ] as const
          ).map(([key, name, note]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={path === key}
              className={`kindpick__opt ${path === key ? 'is-on' : ''}`}
              onClick={() => {
                setPath(key);
                setRunners((prev) => (key === 'solo' ? prev.slice(0, 1) : prev));
              }}
            >
              <span className="kindpick__name">{name}</span>
              <span className="kindpick__note">{note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------- the captain */}
      <fieldset className="racereg__block">
        <legend>{path === 'solo' ? 'How we reach you' : 'Who is organising this'}</legend>

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor={`${uid}-email`}>
              Email <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-phone`}>
              Phone <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor={`${uid}-city`}>
              City
            </label>
            <input
              className="input"
              id={`${uid}-city`}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-state`}>
              State
            </label>
            <input
              className="input"
              id={`${uid}-state`}
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        {path === 'team' ? (
          <div className="field">
            <label className="label" htmlFor={`${uid}-team`}>
              Team or organization name <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-team`}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
        ) : null}

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor={`${uid}-ename`}>
              Emergency contact name <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-ename`}
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-ephone`}>
              Emergency contact phone <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-ephone`}
              type="tel"
              inputMode="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
            />
            {path !== 'solo' ? (
              <span className="hint">Used for every runner unless you change it below.</span>
            ) : null}
          </div>
        </div>
      </fieldset>

      {/* ---------------------------------------------------------- the runners */}
      <fieldset className="racereg__block">
        <legend>{path === 'solo' ? 'You' : `Runners (${runners.length})`}</legend>

        {runners.map((runner, i) => {
          const age = ages[i];
          const minor = age !== null && isMinorAge(age);

          return (
            <div className="racereg__runner" key={i}>
              {path !== 'solo' ? (
                <p className="racereg__runnerhead">
                  Runner {i + 1}
                  {age !== null ? (
                    <span className="racereg__age">
                      {age} on race day
                      {age <= KID_MAX_AGE ? ', kid rate' : ''}
                    </span>
                  ) : null}
                </p>
              ) : null}

              <div className="grid2">
                <div className="field">
                  <label className="label" htmlFor={`${uid}-fn-${i}`}>
                    First name <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    id={`${uid}-fn-${i}`}
                    value={runner.firstName}
                    onChange={(e) => setRunner(i, { firstName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`${uid}-ln-${i}`}>
                    Last name <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    id={`${uid}-ln-${i}`}
                    value={runner.lastName}
                    onChange={(e) => setRunner(i, { lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label className="label" htmlFor={`${uid}-dob-${i}`}>
                    Date of birth <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    id={`${uid}-dob-${i}`}
                    type="date"
                    value={runner.dateOfBirth}
                    onChange={(e) => setRunner(i, { dateOfBirth: e.target.value })}
                  />
                  <span className="hint">Sets the age group and the price.</span>
                </div>
                <div className="field">
                  <label className="label" htmlFor={`${uid}-g-${i}`}>
                    Gender
                  </label>
                  <select
                    className="select"
                    id={`${uid}-g-${i}`}
                    value={runner.gender}
                    onChange={(e) => setRunner(i, { gender: e.target.value })}
                  >
                    <option value="">Prefer not to say</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {shirtsOpen ? (
                <div className="field">
                  <label className="label" htmlFor={`${uid}-shirt-${i}`}>
                    Shirt, {dollars(RACE_ADDONS.shirt)}
                  </label>
                  <select
                    className="select"
                    id={`${uid}-shirt-${i}`}
                    value={runner.shirtSize}
                    onChange={(e) => setRunner(i, { shirtSize: e.target.value })}
                  >
                    <option value="">No shirt</option>
                    {SHIRT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {minor ? (
                <div className="field racereg__guardian">
                  <label className="label" htmlFor={`${uid}-guard-${i}`}>
                    Parent or guardian name <span className="req">*</span>
                  </label>
                  <input
                    className="input"
                    id={`${uid}-guard-${i}`}
                    value={runner.guardianName}
                    onChange={(e) => setRunner(i, { guardianName: e.target.value })}
                  />
                  <span className="hint">
                    Required for anybody under {ADULT_MIN_AGE} on race day. A parent or guardian
                    also signs at the bottom.
                  </span>
                </div>
              ) : null}

              {path !== 'solo' ? (
                <div className="grid2">
                  <div className="field">
                    <label className="label" htmlFor={`${uid}-en-${i}`}>
                      Emergency contact, if different
                    </label>
                    <input
                      className="input"
                      id={`${uid}-en-${i}`}
                      placeholder={emergencyName || 'Same as above'}
                      value={runner.emergencyName}
                      onChange={(e) => setRunner(i, { emergencyName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`${uid}-ep-${i}`}>
                      Their phone
                    </label>
                    <input
                      className="input"
                      id={`${uid}-ep-${i}`}
                      type="tel"
                      placeholder={emergencyPhone || 'Same as above'}
                      value={runner.emergencyPhone}
                      onChange={(e) => setRunner(i, { emergencyPhone: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}

              {path !== 'solo' && runners.length > 1 ? (
                <button
                  className="btn btn--sm btn--ghost"
                  type="button"
                  onClick={() => setRunners((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove runner {i + 1}
                </button>
              ) : null}
            </div>
          );
        })}

        {path !== 'solo' && runners.length < maxRunners ? (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setRunners((prev) => [...prev, blankRunner()])}
          >
            Add another runner
          </button>
        ) : null}
      </fieldset>

      {/* ----------------------------------------------------------- the extras */}
      <fieldset className="racereg__block">
        <legend>Anything else</legend>

        {!shirtsOpen ? (
          <p className="formnote">
            Shirts are closed for this year. The printer needed the count, and a shirt
            ordered now would not be here in time.
          </p>
        ) : null}

        <label className="check">
          <input type="checkbox" checked={bibName} onChange={(e) => setBibName(e.target.checked)} />
          <span>Put my name on the bib, {dollars(RACE_ADDONS.bibName)}</span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={parkingPass}
            onChange={(e) => setParkingPass(e.target.checked)}
          />
          <span>Reserved parking pass, {dollars(RACE_ADDONS.parkingPass)}</span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={foodVoucher}
            onChange={(e) => setFoodVoucher(e.target.checked)}
          />
          <span>Food truck voucher, {dollars(RACE_ADDONS.foodVoucher)}</span>
        </label>

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor={`${uid}-medals`}>
              Extra medals, {dollars(RACE_ADDONS.extraMedal)} each
            </label>
            <input
              className="input"
              id={`${uid}-medals`}
              type="number"
              min={0}
              max={20}
              value={extraMedals}
              onChange={(e) => setExtraMedals(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-donation`}>
              Add a donation
            </label>
            <input
              className="input"
              id={`${uid}-donation`}
              inputMode="decimal"
              placeholder="0"
              value={donation}
              onChange={(e) => setDonation(e.target.value)}
            />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="label" htmlFor={`${uid}-pace`}>
              Estimated pace
            </label>
            <input
              className="input"
              id={`${uid}-pace`}
              placeholder="10:00 per mile, or walking"
              value={pace}
              onChange={(e) => setPace(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${uid}-heard`}>
              How did you hear about us
            </label>
            <input
              className="input"
              id={`${uid}-heard`}
              value={heardAbout}
              onChange={(e) => setHeardAbout(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-medical`}>
            Anything we should know medically
          </label>
          <textarea
            className="input"
            id={`${uid}-medical`}
            rows={2}
            value={medical}
            onChange={(e) => setMedical(e.target.value)}
          />
          <span className="hint">
            Seen only by the people running the race. It is never printed on any list.
          </span>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------ the money */}
      <div className="racereg__quote">
        <dl>
          <div>
            <dt>Entry</dt>
            <dd>{dollars(quote.entry)}</dd>
          </div>
          {quote.shirts ? (
            <div>
              <dt>Shirts</dt>
              <dd>{dollars(quote.shirts)}</dd>
            </div>
          ) : null}
          {quote.addons ? (
            <div>
              <dt>Extras</dt>
              <dd>{dollars(quote.addons)}</dd>
            </div>
          ) : null}
          {quote.gift ? (
            <div>
              <dt>Donation</dt>
              <dd>{dollars(quote.gift)}</dd>
            </div>
          ) : null}
          <div className="racereg__total">
            <dt>Total</dt>
            <dd>{dollars(quote.total)}</dd>
          </div>
        </dl>
      </div>

      {/* ----------------------------------------------------------- the waiver */}
      <fieldset className="racereg__block racereg__waiver">
        <legend>The waiver</legend>

        {RACE_WAIVER_IS_DRAFT ? (
          <p className="formnote formnote--error">
            This waiver is a draft and has not been reviewed by a lawyer yet. It is on the page
            so you can read exactly what you are being asked to sign.
          </p>
        ) : null}

        <div className="racereg__waivertext">
          {RACE_WAIVER.map((block, i) => {
            if (block.kind === 'heading') return <h4 key={i}>{block.text}</h4>;
            if (block.kind === 'conspicuous') {
              return (
                <p key={i} className="racereg__conspicuous">
                  {block.text}
                </p>
              );
            }
            if (block.kind === 'list') {
              return (
                <ul key={i}>
                  {(block.items ?? []).map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i}>{block.text}</p>;
          })}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={waiverAccepted}
            onChange={(e) => setWaiverAccepted(e.target.checked)}
          />
          <span>
            I have read all of it, I understand I am giving up legal rights, and I agree to it.
          </span>
        </label>

        <div className="field">
          <label className="label" htmlFor={`${uid}-sig`}>
            Type your full name to sign <span className="req">*</span>
          </label>
          <input
            className="input"
            id={`${uid}-sig`}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
        </div>

        {anyMinor ? (
          <div className="field racereg__guardian">
            <label className="label" htmlFor={`${uid}-gsig`}>
              Parent or guardian, type your full name to sign <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-gsig`}
              value={guardianSignature}
              onChange={(e) => setGuardianSignature(e.target.value)}
            />
            <span className="hint">
              Required because at least one runner is under {ADULT_MIN_AGE} on race day. This is a
              separate signature from the one above.
            </span>
          </div>
        ) : null}

        <p className="hint">Signing version {RACE_WAIVER_VERSION}.</p>
      </fieldset>

      {error ? (
        <p className="formnote formnote--error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="btn btn--primary btn--lg" type="submit" disabled={status === 'sending'}>
        {status === 'sending'
          ? 'Sending'
          : quote.total > 0
            ? `Register and pay ${dollars(quote.total)}`
            : 'Register'}
      </button>
    </form>
  );
}
