'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type OrgRow = {
  id: string;
  orgName: string;
  orgType: string;
  contactName: string;
  email: string;
  phone: string;
  volunteerCount: number;
  is501c3: boolean;
  story: string;
  games: string[];
  status: string;
  appliedAt: string;
  /** True once they have signed, which is what makes a PDF producible. */
  signed: boolean;
};

export type GameRow = {
  slug: string;
  name: string;
  displayDate: string;
  orgName: string | null;
  pickedFromCount: number | null;
  parkingGrossCents: number | null;
  payoutCents: number | null;
  paidAt: string;
  published: boolean;
  /** The drawn organization's id, for the QR sheet. Null until a draw. */
  orgId: string | null;
  parking: {
    cents: number;
    vehicles: number;
    /** The flat 3.25 percent the organization is paid on. */
    flatFeeCents: number;
    /** What Square actually charged, and how many rows have not settled. */
    actualFeeCents: number;
    actualFeesPending: number;
    donationCents: number;
    donations: number;
    shareCents: number;
    owedCents: number;
    basis: string;
  };
  waivers: {
    /* Named and identified. The id is what makes each name a link to that
       volunteer's own signed waiver, which is the document somebody asks for
       by name rather than by position in a list. */
    adults: { id: string; name: string }[];
    minors: { id: string; name: string }[];
    minimum: number;
    short: number;
    met: boolean;
  };
};

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

/**
 * The Parking Fundraiser panel.
 *
 * Reads the same density, type scale and chip discipline as the rest of the
 * tracker: neutral by default, orange only where something needs doing.
 */
/**
 * Parking money for one game, and the one number the organization never sees.
 *
 * They are paid on a flat 3.25 percent, which is stable while the night is on
 * and which they can check against a total with a calculator. What Square
 * actually charged sits here beside it, because the difference is Coyoteville's
 * to carry and Robert is the only person who should be watching it.
 *
 * The direction is stated in words rather than shown as an unsigned number.
 * "The flat rate kept nine dollars more than Square charged" and "the flat rate
 * is nine dollars short" are opposite facts, and a reader should not have to
 * work out which one a bare figure means.
 */
function Parking({ game }: { game: GameRow }) {
  const p = game.parking;
  if (!p.cents && !p.donationCents) return null;

  const difference = p.flatFeeCents - p.actualFeeCents;

  return (
    <div className="pk">
      <div className="pk__top">
        <span className="pk__amount">{money(p.cents)}</span>
        <span className="pk__label">
          parking, {p.vehicles} {p.vehicles === 1 ? 'vehicle' : 'vehicles'}
        </span>
      </div>

      <p className="pk__line">
        Flat 3.25% <b>{money(p.flatFeeCents)}</b>
        <span className="pk__sep">against</span>
        Square actual <b>{money(p.actualFeeCents)}</b>
        {p.actualFeesPending ? (
          <span className="pk__pending"> {p.actualFeesPending} not settled yet</span>
        ) : null}
      </p>

      <p className="pk__line pk__line--diff">
        {difference === 0
          ? 'The flat rate matched Square exactly.'
          : difference > 0
            ? 'The flat rate kept ' + money(difference) + ' more than Square charged.'
            : 'The flat rate is ' + money(Math.abs(difference)) + ' short of what Square charged.'}
      </p>

      <p className="pk__line">
        Their share on {p.basis} <b>{money(p.shareCents)}</b>
        {p.donationCents ? (
          <>
            <span className="pk__sep">plus gifts</span>
            <b>{money(p.donationCents)}</b>
          </>
        ) : null}
        <span className="pk__sep">owed</span>
        <b className="pk__owed">{money(p.owedCents)}</b>
      </p>
    </div>
  );
}

/**
 * Signed waivers for one game, read at a glance in the dark.
 *
 * The adult count against the minimum is the whole point and is the only thing
 * here in large type: it decides whether the forfeit in section 4 applies, and
 * that decision gets made standing in a lot a few minutes before parking opens.
 * So it says "4 of 6" and, when it is short, exactly how many are missing.
 *
 * Minors are counted and named and never added in. A minor who has signed is a
 * real volunteer with a real waiver and is explicitly not one of the six, so a
 * single total would answer the wrong question at the one moment it matters.
 */
/**
 * The signed names, each one a link to that person's waiver.
 *
 * A list of names is what you read on the night; a link under the name is what
 * you need in March when somebody asks for one specific waiver. Both, from one
 * line, rather than a separate table nobody would scroll to.
 */
function WaiverNames({ people }: { people: { id: string; name: string }[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i ? ', ' : ' '}
          <a className="wv__name" href={`/api/admin/volunteer-waiver?id=${encodeURIComponent(p.id)}`}>
            {p.name}
          </a>
        </span>
      ))}
    </>
  );
}

function Waivers({ game }: { game: GameRow }) {
  const { adults, minors, minimum, short, met } = game.waivers;
  const qr = `/api/admin/volunteer-qr?event=${encodeURIComponent(game.slug)}${
    game.orgId ? `&org=${encodeURIComponent(game.orgId)}` : ''
  }`;

  return (
    <div className="wv">
      <div className="wv__top">
        <span className={`wv__count ${met ? 'is-met' : 'is-short'}`}>
          {adults.length} of {minimum}
        </span>
        <span className="wv__label">adults signed</span>
        <a className="btn btn--sm btn--ghost wv__qr" href={qr} target="_blank" rel="noreferrer">
          Print QR
        </a>
      </div>

      <p className="wv__state">
        {met
          ? 'The adult minimum is met.'
          : `${short} more ${short === 1 ? 'adult' : 'adults'} needed to meet the minimum.`}
        {minors.length ? ` ${minors.length} under 18 signed, not counted.` : ''}
      </p>

      {adults.length ? (
        <p className="wv__names">
          <span className="wv__names-head">Adults</span>
          <WaiverNames people={adults} />
        </p>
      ) : (
        <p className="wv__names wv__names--none">Nobody has signed for this game yet.</p>
      )}

      {minors.length ? (
        <p className="wv__names">
          <span className="wv__names-head">Under 18</span>
          <WaiverNames people={minors} />
        </p>
      ) : null}

      {/* Every waiver from this night in one file, which is the unit anybody
          asks for: an insurer, a lawyer, or Robert checking who worked. The
          manifest inside counts adults against the minimum. */}
      {adults.length + minors.length ? (
        <p className="wv__docs">
          <a
            className="btn btn--sm btn--ghost"
            href={`/api/admin/volunteer-waivers?event=${encodeURIComponent(game.slug)}`}
          >
            Download {adults.length + minors.length} waiver
            {adults.length + minors.length === 1 ? '' : 's'}
          </a>
        </p>
      ) : null}
    </div>
  );
}

export default function Organizations({
  applications,
  games,
}: {
  applications: OrgRow[];
  games: GameRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draw, setDraw] = useState<{ slug: string; count: number; names: string[]; reopened: boolean } | null>(null);
  const [gross, setGross] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<{
    slug: string;
    emailed: boolean;
    texted: boolean;
    url: string;
    note: string | null;
  } | null>(null);

  async function call(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || !data.ok) {
        setError(String(data.error ?? 'That did not go through.'));
        return null;
      }
      return data;
    } catch {
      setError('Could not reach the server.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  const refresh = () => startTransition(() => router.refresh());
  const locked = Boolean(busy) || pending;

  const pendingApps = applications.filter((a) => a.status === 'pending');
  const signedCount = applications.filter((a) => a.signed).length;

  return (
    <div className="orgs">
      {error ? (
        <p className="orgs__error" role="alert">
          {error}
        </p>
      ) : null}

      {/* ------------------------------------------------------- games */}
      <p className="orgs__head">Home games</p>

      {/* One sheet, not one per game. The QR points at /park, which resolves
          the night itself, so this is printed once and laminated and works
          every game after this one. */}
      <p className="orgs__doc">
        <a className="btn btn--sm btn--ghost" href="/api/admin/parking-qr" target="_blank" rel="noreferrer">
          Print parking QR
        </a>
      </p>
      <ul className="orgs__games">
        {games.map((g) => (
          <li className="orgs__game" key={g.slug}>
            <div className="orgs__game-top">
              <span className="orgs__game-name">{g.name}</span>
              <span className="badge">{g.displayDate}</span>
            </div>

            {/* Outside the drawn branch on purpose. Somebody can sign before a
                draw is made, and a count that only appears after one would hide
                exactly the signatures nobody expected. */}
            <Parking game={g} />

            <Waivers game={g} />

            {/* Their live page. Sent by hand, never automatically: Robert
                decides when an organization gets the link. Both sends are
                reported separately, because a text that failed while the email
                went is a different situation from neither going. */}
            {g.orgId ? (
              <p className="orgs__doc">
                <button
                  className="btn btn--sm btn--ghost"
                  type="button"
                  disabled={locked}
                  onClick={async () => {
                    const res = await call({ action: 'live-link', id: g.orgId }, 'live:' + g.slug);
                    if (!res) return;
                    setSent({
                      slug: g.slug,
                      emailed: Boolean(res.emailed),
                      texted: Boolean(res.texted),
                      url: String(res.url ?? ''),
                      note: res.note ? String(res.note) : null,
                    });
                  }}
                >
                  Send the live page link
                </button>
              </p>
            ) : null}

            {sent && sent.slug === g.slug ? (
              <p className="orgs__from orgs__sent">
                {sent.emailed && sent.texted
                  ? 'Emailed and texted.'
                  : sent.emailed
                    ? 'Emailed. Not texted' + (sent.note ? ': ' + sent.note : '.')
                    : 'Texted, but the email failed.'}{' '}
                <a href={sent.url} target="_blank" rel="noreferrer">
                  Open it
                </a>
              </p>
            ) : null}

            {g.orgName ? (
              <>
                <p className="orgs__game-org">
                  {g.orgName}
                  {g.pickedFromCount ? (
                    <span className="orgs__from"> drawn from {g.pickedFromCount}</span>
                  ) : null}
                </p>

                <div className="orgs__payout">
                  <label className="orgs__field">
                    <span className="orgs__label">Parking gross, dollars</span>
                    <input
                      className="input input--sm"
                      inputMode="decimal"
                      value={gross[g.slug] ?? (g.parkingGrossCents ? String(g.parkingGrossCents / 100) : '')}
                      onChange={(e) => setGross((s) => ({ ...s, [g.slug]: e.target.value }))}
                      disabled={locked}
                    />
                  </label>
                  <button
                    className="btn btn--sm btn--ghost"
                    type="button"
                    disabled={locked}
                    onClick={async () => {
                      const value = Number(gross[g.slug] ?? '');
                      if (!Number.isFinite(value)) return setError('Enter the parking total in dollars.');
                      const r = await call(
                        { action: 'payout', eventSlug: g.slug, grossCents: Math.round(value * 100), paidMethod: 'check' },
                        'payout:' + g.slug
                      );
                      if (r) refresh();
                    }}
                  >
                    Record
                  </button>
                </div>

                <p className="orgs__numbers">
                  {g.parkingGrossCents !== null ? (
                    <>
                      Gross <b>{money(g.parkingGrossCents)}</b>, payout{' '}
                      <b>{money(g.payoutCents ?? 0)}</b>
                      {g.paidAt ? <span className="orgs__from"> paid {g.paidAt}</span> : null}
                    </>
                  ) : (
                    <span className="orgs__from">No parking total entered yet.</span>
                  )}
                </p>

                {g.published ? (
                  <p className="orgs__from">Published on the public ledger.</p>
                ) : (
                  <button
                    className="btn btn--sm btn--amber"
                    type="button"
                    disabled={locked || g.parkingGrossCents === null}
                    onClick={async () => {
                      const r = await call({ action: 'publish', eventSlug: g.slug }, 'pub:' + g.slug);
                      if (r) refresh();
                    }}
                  >
                    Publish to the ledger
                  </button>
                )}
              </>
            ) : draw && draw.slug === g.slug ? (
              <>
                <p className="orgs__game-org">
                  {draw.count === 0
                    ? 'Nobody has applied for this game yet.'
                    : `Drawing at random from ${draw.count} ${draw.count === 1 ? 'organization' : 'organizations'}.`}
                </p>
                {draw.names.length ? <p className="orgs__from">{draw.names.join(', ')}</p> : null}
                {draw.reopened ? (
                  <p className="orgs__from">
                    Everyone has had a game, so the pool has reopened to all applicants.
                  </p>
                ) : null}
                {draw.count > 0 ? (
                  <button
                    className="btn btn--sm btn--amber"
                    type="button"
                    disabled={locked}
                    onClick={async () => {
                      const r = await call({ action: 'pick', eventSlug: g.slug }, 'pick:' + g.slug);
                      if (r) {
                        setDraw(null);
                        refresh();
                      }
                    }}
                  >
                    Draw from {draw.count}
                  </button>
                ) : null}{' '}
                <button className="btn btn--sm btn--ghost" type="button" onClick={() => setDraw(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn btn--sm btn--ghost"
                type="button"
                disabled={locked}
                onClick={async () => {
                  const r = await call({ action: 'pool', eventSlug: g.slug }, 'pool:' + g.slug);
                  if (r) {
                    setDraw({
                      slug: g.slug,
                      count: Number(r.count ?? 0),
                      names: (r.names as string[]) ?? [],
                      reopened: Boolean(r.reopened),
                    });
                  }
                }}
              >
                Pick an organization
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* -------------------------------------------------- applications */}
      <p className="orgs__head">
        Applications
        {pendingApps.length ? <span className="fchip__count">{pendingApps.length}</span> : null}
      </p>

      {/* Every signed set of terms in one file. Not scoped to an event: an
          organization applies once for a season and names the games it can
          work, so there is no per event slice of this to take. */}
      {signedCount ? (
        <p className="orgs__doc">
          <a className="btn btn--sm btn--ghost" href="/api/admin/org-terms-all">
            Download all {signedCount} signed terms
          </a>
        </p>
      ) : null}

      {applications.length === 0 ? (
        <p className="orgs__from">Nobody has applied yet.</p>
      ) : (
        <ul className="orgs__apps">
          {applications.map((a) => (
            <li className="orgs__app" key={a.id}>
              <div className="orgs__app-top">
                <span className="orgs__game-name">{a.orgName}</span>
                <span className="badge">{a.status}</span>
              </div>
              <p className="orgs__meta">
                {a.orgType} · {a.volunteerCount} adults{a.is501c3 ? ' · 501(c)(3)' : ''}
              </p>
              <p className="orgs__meta">
                {a.contactName} · <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`}>{a.phone}</a> ·{' '}
                <a href={`mailto:${a.email}`}>{a.email}</a>
              </p>
              <p className="orgs__games-for">{a.games.join(', ') || 'No games picked'}</p>
              <p className="orgs__story">{a.story}</p>

              {/* The document they signed, in the version they signed it in.
                  Only offered where there is one: a row with no signature has
                  no terms to produce, and a button that 409s is worse than no
                  button. */}
              {a.signed ? (
                <p className="orgs__doc">
                  <a
                    className="btn btn--sm btn--ghost"
                    href={`/api/admin/org-terms?id=${encodeURIComponent(a.id)}`}
                  >
                    Signed terms PDF
                  </a>
                </p>
              ) : null}

              {a.status === 'pending' ? (
                <div className="orgs__actions">
                  <button
                    className="btn btn--sm btn--amber"
                    type="button"
                    disabled={locked}
                    onClick={async () => {
                      const r = await call({ action: 'status', id: a.id, status: 'selected' }, 'ok:' + a.id);
                      if (r) refresh();
                    }}
                  >
                    Approve
                  </button>{' '}
                  <button
                    className="btn btn--sm btn--ghost"
                    type="button"
                    disabled={locked}
                    onClick={async () => {
                      const r = await call({ action: 'status', id: a.id, status: 'declined' }, 'no:' + a.id);
                      if (r) refresh();
                    }}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
