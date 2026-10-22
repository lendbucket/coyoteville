'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dollars, SHIRT_SIZES, type ShirtSize } from '@/lib/race';
import { SPONSOR_LEVELS, sponsorLevelById } from '@/lib/race-sponsorship';

/**
 * The Race tab.
 *
 * Run from a phone at a folding table with a queue in front of it, so the
 * check-in list is the thing that has to be fast: search is local over the rows
 * already in memory, and a tap posts one small write rather than reloading the
 * tab.
 */

type Runner = {
  id: string;
  groupId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  ageOnRaceDay: number | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalNotes: string | null;
  tier: string;
  teamName: string | null;
  shirtSize: ShirtSize | null;
  paymentStatus: string;
  bibNumber: number | null;
  checkedInAt: string | null;
  shirtCollected: boolean;
  isMinor: boolean;
  guardianName: string | null;
};

type Group = {
  id: string;
  groupType: string;
  groupName: string | null;
  captainName: string | null;
  captainPhone: string | null;
  runnerCount: number | null;
  amountCents: number;
  paymentStatus: string;
};

type Sponsor = {
  id: string;
  level: string;
  businessName: string;
  contactName: string | null;
  amountCents: number;
  paymentStatus: string;
  agreementVersion: string | null;
  signedAt: string | null;
  publishedAt: string | null;
};

type Standing = {
  takenByLevel: Record<string, number>;
  committedCents: number;
  collectedCents: number;
  count: number;
};

type View = {
  byTier: Record<string, { registered: number; paid: number; unpaid: number }>;
  shirts: Record<string, number>;
  shirtTotal: number;
  runners: Runner[];
  groups: Group[];
  sponsors: Sponsor[];
  checkedIn: number;
  bibbed: number;
};

const settled = (status: string) => status === 'paid' || status === 'not_required';

const TIER_LABELS: Record<string, string> = {
  adult: 'Adult',
  kid: 'Kid, 12 and under',
  family: 'Family',
  team: 'Team',
  virtual: 'Virtual',
};

export default function RaceTracker() {
  const [view, setView] = useState<View | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bibNote, setBibNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/race', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not load the race.');
      setView(data.view);
      setStanding(data.standing);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the race.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* One write, then patch the row in place. Reloading the whole tab after every
     tap would throw the list back to the top while somebody is working down
     it. */
  const write = useCallback(
    async (action: string, id: string, on: boolean, patch: (r: Runner) => Runner) => {
      setBusy(id + action);
      try {
        const res = await fetch('/api/admin/race', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, id, on }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'That did not save.');

        setView((current) =>
          current
            ? { ...current, runners: current.runners.map((r) => (r.id === id ? patch(r) : r)) }
            : current
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not save.');
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const checkIn = (r: Runner) =>
    write('checkin', r.id, !r.checkedInAt, (row) => ({
      ...row,
      checkedInAt: row.checkedInAt ? null : new Date().toISOString(),
    }));

  const shirt = (r: Runner) =>
    write('shirt', r.id, !r.shirtCollected, (row) => ({
      ...row,
      shirtCollected: !row.shirtCollected,
    }));

  const assignBibs = async () => {
    setBusy('bibs');
    setBibNote(null);
    try {
      const res = await fetch('/api/admin/race', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bibs' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not assign bibs.');
      setBibNote(
        data.assigned === 0
          ? 'Everybody paid already has a number. Nothing changed.'
          : `Numbered ${data.assigned}. Highest bib is now ${data.highest}.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign bibs.');
    } finally {
      setBusy(null);
    }
  };

  const publishSponsor = async (s: Sponsor) => {
    setBusy(s.id);
    try {
      const res = await fetch('/api/admin/race', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish-sponsor', id: s.id, on: !s.publishedAt }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'That did not save.');
      setView((current) =>
        current
          ? {
              ...current,
              sponsors: current.sponsors.map((row) =>
                row.id === s.id ? { ...row, publishedAt: data.publishedAt } : row
              ),
            }
          : current
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  /* Search is local, over rows already here. On stadium signal a request per
     keystroke is a search that stops working at the worst moment. */
  const shown = useMemo(() => {
    if (!view) return [];
    const q = query.trim().toLowerCase();
    if (!q) return view.runners;
    return view.runners.filter((r) =>
      [r.lastName, r.firstName, r.teamName ?? '', String(r.bibNumber ?? '')]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [view, query]);

  if (error && !view) {
    return (
      <div className="ash__empty">
        <p>{error}</p>
        <button type="button" className="btn btn--ghost" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  if (!view || !standing) return <p className="ash__empty">Loading the race.</p>;

  const titleTaken = (standing.takenByLevel.title ?? 0) > 0;

  return (
    <div className="race-tr">
      {error ? <p className="race-tr__error">{error}</p> : null}

      {/* ------------------------------------------------- sponsor standing */}
      <section className="race-tr__block" aria-labelledby="rt-money">
        <h3 id="rt-money">Sponsorship</h3>

        <div className="race-tr__figures">
          <div className="race-tr__figure">
            <span className="race-tr__num">{dollars(standing.committedCents)}</span>
            <span className="race-tr__cap">Committed</span>
          </div>
          <div className="race-tr__figure">
            <span className="race-tr__num">{dollars(standing.collectedCents)}</span>
            <span className="race-tr__cap">Collected</span>
          </div>
          <div className="race-tr__figure">
            <span className="race-tr__num">{standing.count}</span>
            <span className="race-tr__cap">Sponsors</span>
          </div>
          <div className="race-tr__figure">
            <span className="race-tr__num">{titleTaken ? 'Sold' : 'Open'}</span>
            <span className="race-tr__cap">Title level</span>
          </div>
        </div>

        {/* Committed and collected are two numbers on purpose. Committed is
            what has been promised; collected is money in hand. The gap is the
            chasing list. */}
        <p className="race-tr__note">
          Committed counts everything not refunded. Collected counts what has actually been paid.
        </p>
      </section>

      {/* ------------------------------------------------------ entry counts */}
      <section className="race-tr__block" aria-labelledby="rt-entries">
        <h3 id="rt-entries">Entries</h3>

        <div className="race-tr__tablewrap">
          <table className="race-tr__table">
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col">Registered</th>
                <th scope="col">Paid</th>
                <th scope="col">Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(view.byTier)
                .filter(([tierKey]) => tierKey !== 'total')
                .map(([tierKey, row]) => (
                  <tr key={tierKey}>
                    <th scope="row">{TIER_LABELS[tierKey] ?? tierKey}</th>
                    <td>{row.registered}</td>
                    <td>{row.paid}</td>
                    <td>{row.unpaid}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{view.byTier.total.registered}</td>
                <td>{view.byTier.total.paid}</td>
                <td>{view.byTier.total.unpaid}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="race-tr__note">
          {view.checkedIn} checked in. {view.bibbed} numbered.
        </p>
      </section>

      {/* ------------------------------------------------------------ shirts */}
      <section className="race-tr__block" aria-labelledby="rt-shirts">
        <h3 id="rt-shirts">Shirts to print</h3>

        <div className="race-tr__tablewrap">
          <table className="race-tr__table">
            <thead>
              <tr>
                <th scope="col">Size</th>
                {SHIRT_SIZES.map((size) => (
                  <th scope="col" key={size}>
                    {size}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Paid</th>
                {SHIRT_SIZES.map((size) => (
                  <td key={size}>{view.shirts[size] ?? 0}</td>
                ))}
                <td>{view.shirtTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Paid only. An unpaid entry's size is a guess at what somebody might
            order, and the printer is not a guess. */}
        <p className="race-tr__note">
          Paid entries only. This is the number to hand the printer.
        </p>
      </section>

      {/* ----------------------------------------------------------- exports */}
      <section className="race-tr__block" aria-labelledby="rt-exports">
        <h3 id="rt-exports">Downloads</h3>

        <p className="race-tr__actions">
          <a className="btn btn--ghost" href="/api/admin/race/export?kind=runners">
            Runner sheet
          </a>
          <a className="btn btn--ghost" href="/api/admin/race/export?kind=awards">
            Age group awards
          </a>
          <a className="btn btn--ghost" href="/api/admin/race/export?kind=sponsors">
            Sponsor reconciliation
          </a>
        </p>

        <p className="race-tr__note">
          The runner sheet has no medical notes in it, on purpose. It gets printed and left on a
          table. Medical notes are on the runner row below and nowhere else.
        </p>
      </section>

      {/* ------------------------------------------------------------ groups */}
      {view.groups.length ? (
        <section className="race-tr__block" aria-labelledby="rt-groups">
          <h3 id="rt-groups">Families and teams</h3>

          <ul className="race-tr__groups">
            {view.groups.map((g) => {
              const members = view.runners.filter((r) => r.groupId === g.id);
              const open = openGroup === g.id;

              return (
                <li key={g.id} className="race-tr__group">
                  <button
                    type="button"
                    className="race-tr__grouphead"
                    aria-expanded={open}
                    onClick={() => setOpenGroup(open ? null : g.id)}
                  >
                    <span className="race-tr__groupname">
                      {g.groupName ?? 'Unnamed'}{' '}
                      <span className="race-tr__groupkind">{g.groupType}</span>
                    </span>
                    <span className="race-tr__groupmeta">
                      {members.length} {members.length === 1 ? 'runner' : 'runners'},{' '}
                      {dollars(g.amountCents)}, {settled(g.paymentStatus) ? 'paid' : g.paymentStatus}
                    </span>
                  </button>

                  {open ? (
                    <div className="race-tr__groupbody">
                      <p className="race-tr__note">
                        Captain {g.captainName ?? 'not given'}
                        {g.captainPhone ? `, ${g.captainPhone}` : ''}. The money is on this row;
                        the runners below are all zero, which is correct.
                      </p>
                      <ul className="race-tr__groupruns">
                        {members.map((m) => (
                          <li key={m.id}>
                            {m.bibNumber ? `${m.bibNumber}. ` : ''}
                            {m.lastName}, {m.firstName}
                            {m.shirtSize ? ` (${m.shirtSize})` : ''}
                            {m.checkedInAt ? ' checked in' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------- the runners */}
      <section className="race-tr__block" aria-labelledby="rt-runners">
        <h3 id="rt-runners">Check in</h3>

        <p className="race-tr__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void assignBibs()}
            disabled={busy === 'bibs'}
          >
            {busy === 'bibs' ? 'Assigning' : 'Assign bibs'}
          </button>
        </p>

        {bibNote ? <p className="race-tr__note">{bibNote}</p> : null}

        <p className="race-tr__note">
          Numbers every paid entry with no bib, from 1, in last name order. Anybody already
          numbered keeps their number, so this is safe to run again after race morning signups
          are paid.
        </p>

        <label className="race-tr__search">
          <span className="race-tr__searchlabel">Search runners</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Last name, first name, team or bib"
            autoComplete="off"
          />
        </label>

        <p className="race-tr__note">
          {shown.length} of {view.runners.length} shown, last name first.
        </p>

        <ul className="race-tr__runners">
          {shown.map((r) => (
            <li key={r.id} className="race-tr__runner" data-in={r.checkedInAt ? 'yes' : 'no'}>
              <div className="race-tr__who">
                <span className="race-tr__bib">{r.bibNumber ?? '--'}</span>
                <span className="race-tr__name">
                  {r.lastName}, {r.firstName}
                </span>
                <span className="race-tr__meta">
                  {TIER_LABELS[r.tier] ?? r.tier}
                  {r.ageOnRaceDay !== null ? `, ${r.ageOnRaceDay}` : ''}
                  {r.gender ? `, ${r.gender}` : ''}
                  {r.shirtSize ? `, shirt ${r.shirtSize}` : ', no shirt'}
                  {settled(r.paymentStatus) ? '' : `, ${r.paymentStatus}`}
                </span>
                {r.teamName ? <span className="race-tr__meta">{r.teamName}</span> : null}
                <span className="race-tr__meta">
                  In case: {r.emergencyContactName}, {r.emergencyContactPhone}
                </span>
                {r.isMinor ? (
                  <span className="race-tr__minor">
                    Under 18. Guardian {r.guardianName ?? 'not recorded'}.
                  </span>
                ) : null}
                {/* Admin only, and only here. Never in an export. */}
                {r.medicalNotes ? (
                  <span className="race-tr__medical">Medical: {r.medicalNotes}</span>
                ) : null}
              </div>

              <div className="race-tr__taps">
                <button
                  type="button"
                  className={r.checkedInAt ? 'btn btn--ghost' : 'btn btn--primary'}
                  onClick={() => void checkIn(r)}
                  disabled={busy === r.id + 'checkin'}
                >
                  {r.checkedInAt ? 'Checked in' : 'Check in'}
                </button>
                <button
                  type="button"
                  className={r.shirtCollected ? 'btn btn--ghost' : 'btn btn--quiet'}
                  onClick={() => void shirt(r)}
                  disabled={busy === r.id + 'shirt'}
                >
                  {r.shirtCollected ? 'Shirt given' : 'Shirt'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {!shown.length ? <p className="ash__empty">Nobody matches that.</p> : null}
      </section>

      {/* ---------------------------------------------------------- sponsors */}
      <section className="race-tr__block" aria-labelledby="rt-sponsors">
        <h3 id="rt-sponsors">Sponsors</h3>

        {view.sponsors.filter((s) => settled(s.paymentStatus)).length ? (
          <ul className="race-tr__sponsors">
            {view.sponsors
              .filter((s) => settled(s.paymentStatus))
              .map((s) => (
                <li key={s.id} className="race-tr__sponsor">
                  <div>
                    <span className="race-tr__name">{s.businessName}</span>
                    <span className="race-tr__meta">
                      {sponsorLevelById(s.level)?.name ?? s.level}, {dollars(s.amountCents)}
                    </span>
                    <span className="race-tr__meta">
                      {s.agreementVersion
                        ? `Agreement ${s.agreementVersion}`
                        : 'No agreement recorded'}
                      {s.signedAt ? `, signed ${s.signedAt.slice(0, 10)}` : ''}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={s.publishedAt ? 'btn btn--ghost' : 'btn btn--primary'}
                    onClick={() => void publishSponsor(s)}
                    disabled={busy === s.id}
                  >
                    {s.publishedAt ? 'Published' : 'Publish'}
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="ash__empty">No sponsor has paid yet.</p>
        )}

        <h4 className="race-tr__sub">What is still open</h4>
        <ul className="race-tr__levels">
          {SPONSOR_LEVELS.map((level) => {
            const taken = standing.takenByLevel[level.id] ?? 0;
            const left = Math.max(0, level.slots - taken);
            return (
              <li key={level.id}>
                {level.name}, {dollars(level.cents)}:{' '}
                {left === 0 ? 'sold out' : `${left} of ${level.slots} open`}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
