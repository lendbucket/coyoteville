'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Assign the lot plan, then tell every vendor where they stand.
 *
 * Two buttons because they are two decisions. Assign writes numbers onto rows
 * and reports what did not match; send puts those numbers in thirty inboxes.
 * Nothing reaches a vendor until Robert has read the first report, which is the
 * whole reason they are not one button: a name that matched the wrong row is
 * recoverable before the email and awkward afterwards.
 *
 * Every outcome is listed rather than counted. "24 assigned" tells you nothing
 * about the one that did not, and the one that did not is the entire point of
 * running it.
 */

type AssignResult = {
  assigned: number;
  assignedList: string[];
  unmatched: string[];
  ambiguous: string[];
  failed: string[];
  notInPlan: string[];
  approvedRows: number;
};

type SendResult = {
  sent: number;
  sentList: string[];
  already: string[];
  noSpot: string[];
  failed: string[];
  mapAttached: boolean;
};

export default function SpotAssignments({ eventSlug }: { eventSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState<AssignResult | null>(null);
  const [send, setSend] = useState<SendResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* The plan is for one night. Offering the buttons under another event's
     scope would invite assigning September's lot to a different game. */
  if (eventSlug !== 'home-game-2026-09-11') return null;

  async function call(action: string) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/admin/spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
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

  return (
    <div className="spots">
      <p className="spots__head">Spot assignments</p>

      {error ? (
        <p className="orgs__error" role="alert">
          {error}
        </p>
      ) : null}

      <p>
        <button
          className="btn btn--sm btn--ghost"
          type="button"
          disabled={Boolean(busy)}
          onClick={async () => {
            const r = await call('assign');
            if (!r) return;
            setAssign(r as unknown as AssignResult);
            setSend(null);
            router.refresh();
          }}
        >
          {busy === 'assign' ? 'Assigning...' : 'Assign spots from the lot plan'}
        </button>
      </p>

      {assign ? (
        <div className="spots__report">
          <p>
            <b>{assign.assigned}</b> assigned of {assign.approvedRows} approved.
          </p>

          {assign.unmatched.length ? (
            <>
              <p className="spots__warn">
                No approved row matches these {assign.unmatched.length}. Fix the business name on
                the row, or the plan, and assign again.
              </p>
              <ul className="spots__list">
                {assign.unmatched.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Every name in the plan matched a row.</p>
          )}

          {assign.ambiguous.length ? (
            <>
              <p className="spots__warn">
                These matched more than one approved row, so none was touched.
              </p>
              <ul className="spots__list">
                {assign.ambiguous.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}

          {assign.notInPlan.length ? (
            <>
              <p className="spots__warn">
                Approved with no spot in the plan. They will turn up expecting somewhere to stand.
              </p>
              <ul className="spots__list">
                {assign.notInPlan.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          ) : null}

          {assign.failed.length ? (
            <>
              <p className="spots__warn">These failed to write.</p>
              <ul className="spots__list">
                {assign.failed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* The send. Behind a confirm, because it is thirty emails and there is
          no unsending one. */}
      <p className="spots__send">
        {confirming ? (
          <>
            <button
              className="btn btn--sm btn--amber"
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                setConfirming(false);
                const r = await call('send');
                if (!r) return;
                setSend(r as unknown as SendResult);
                router.refresh();
              }}
            >
              {busy === 'send' ? 'Sending...' : 'Yes, send them'}
            </button>{' '}
            <button
              className="btn btn--sm btn--ghost"
              type="button"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="btn btn--sm btn--ghost"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setConfirming(true)}
          >
            Send spot assignments
          </button>
        )}
      </p>

      {send ? (
        <div className="spots__report">
          <p>
            <b>{send.sent}</b> emailed
            {send.mapAttached ? ' with the lot map attached' : ', with no map attached'}.
          </p>

          {!send.mapAttached ? (
            <p className="spots__warn">
              The lot map was not on the server. Drop it at
              public/photos/lot-map-2026-09-11.png and deploy before sending, or they get the
              number without the picture.
            </p>
          ) : null}

          {send.already.length ? (
            <p>
              {send.already.length} already had theirs and were not sent a second: {send.already.join(', ')}
            </p>
          ) : null}

          {send.noSpot.length ? (
            <>
              <p className="spots__warn">Approved with no spot number, so nothing was sent.</p>
              <ul className="spots__list">
                {send.noSpot.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          ) : null}

          {send.failed.length ? (
            <>
              <p className="spots__warn">These failed and can be sent again.</p>
              <ul className="spots__list">
                {send.failed.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
