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
};

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

/**
 * The Friday Night Fund panel.
 *
 * Reads the same density, type scale and chip discipline as the rest of the
 * tracker: neutral by default, orange only where something needs doing.
 */
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

  return (
    <div className="orgs">
      {error ? (
        <p className="orgs__error" role="alert">
          {error}
        </p>
      ) : null}

      {/* ------------------------------------------------------- games */}
      <p className="orgs__head">Home games</p>
      <ul className="orgs__games">
        {games.map((g) => (
          <li className="orgs__game" key={g.slug}>
            <div className="orgs__game-top">
              <span className="orgs__game-name">{g.name}</span>
              <span className="badge">{g.displayDate}</span>
            </div>

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
