import { dollars, type RevenueSummary } from '@/lib/revenue';

/**
 * Money for one event, as a strip at the top of the tracker.
 *
 * Deliberately small. This sits above the vendor list on a phone, so it gets
 * two lines and nothing more: the collected total, then the split by spot type
 * in small text. Anything taller pushes the vendors off the screen, which is
 * what you opened the page for.
 *
 * The rest of the figures, how the money came in, what is still out and what a
 * full lot is worth, live behind a tap. A closed <details> costs no height, so
 * they are one press away without ever being in the way. Tapping the strip
 * itself opens it, which is a bigger target than a chevron.
 *
 * Every figure is handed in already computed by lib/revenue.ts. Nothing is
 * derived here, so the strip and the CSV export cannot disagree.
 */

/** "5 trucks", "1 booth". */
function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="arev__row">
      <span className="arev__rowlabel">{label}</span>
      <span className="arev__rowvalue">{value}</span>
    </div>
  );
}

export default function AdminRevenue({ revenue }: { revenue: RevenueSummary | null }) {
  if (!revenue) {
    return (
      <p className="arev arev--empty">Revenue could not be read for this event.</p>
    );
  }

  const { collected, bySource, outstanding, projected, cash } = revenue;
  const owed = cash.differenceCents;

  return (
    <details className="arev">
      <summary className="arev__strip">
        <span className="arev__top">
          <span className="arev__eyebrow">Collected</span>
          <b className="arev__total">{dollars(collected.cents)}</b>
        </span>

        <span className="arev__breakdown">
          {countOf(collected.truck.count, 'truck', 'trucks')} {dollars(collected.truck.cents)}
          <i className="arev__dot">&middot;</i>
          {countOf(collected.booth.count, 'booth', 'booths')} {dollars(collected.booth.cents)}
          <i className="arev__dot">&middot;</i>
          {countOf(collected.free.count, 'org', 'orgs')} free
        </span>
      </summary>

      <div className="arev__more">
        {/* Booked against held. The strip's headline is what was sold, which is
            not the same as what is in the tin: a prepaid row is stamped paid on
            submission, before anyone has collected from them. */}
        <Row label="Booked" value={dollars(cash.bookedCents)} />
        <Row label="Received" value={dollars(cash.receivedCents)} />
        {owed !== 0 ? (
          <Row
            label={owed > 0 ? 'Not yet in hand' : 'Received over booked'}
            value={dollars(Math.abs(owed))}
          />
        ) : null}
        {cash.unreconciled.count ? (
          <p className="arev__note arev__note--warn">
            {cash.unreconciled.count === 1
              ? '1 offline spot says paid with no cash recorded against it'
              : `${cash.unreconciled.count} offline spots say paid with no cash recorded against them`}
            , {dollars(cash.unreconciled.cents)} booked. The Cash owed chip lists them.
          </p>
        ) : null}

        <Row label="Square" value={dollars(bySource.square.cents)} />
        <Row label="Prepaid" value={dollars(bySource.prepaid.cents)} />
        <Row
          label={`Unpaid, checkout started (${outstanding.count})`}
          value={dollars(outstanding.cents)}
        />
        {projected.cents === null ? (
          <p className="arev__note">Set booth and truck capacity to project a full lot.</p>
        ) : (
          <>
            <Row
              label={projected.complete ? 'A full lot' : 'A full lot (one side only)'}
              value={dollars(projected.cents)}
            />
            {projected.gapCents !== null ? (
              <Row label="Left on the table" value={dollars(projected.gapCents)} />
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
