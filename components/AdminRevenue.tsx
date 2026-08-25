import { dollars, type RevenueSummary } from '@/lib/revenue';

/**
 * Money for one event, at the top of the tracker.
 *
 * Built for a phone first, because that is where it gets read. One big
 * collected figure, then everything else as small label and value lines under
 * it. No chart, no table that has to scroll sideways.
 *
 * Every figure is handed in already computed by lib/revenue.ts. Nothing is
 * derived here, so the page and the CSV export cannot disagree.
 */

function Line({
  label,
  value,
  sub,
  muted = false,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className={`arev__line${muted ? ' arev__line--muted' : ''}`}>
      <span className="arev__label">
        {label}
        {sub ? <em className="arev__sub">{sub}</em> : null}
      </span>
      <span className="arev__value">{value}</span>
    </div>
  );
}

/** "3 trucks", "1 booth". Keeps the count next to the label, not in a column. */
function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function AdminRevenue({ revenue }: { revenue: RevenueSummary | null }) {
  if (!revenue) {
    return (
      <section className="arev arev--empty">
        <p className="arev__note">Revenue could not be read for this event.</p>
      </section>
    );
  }

  const { collected, bySource, outstanding, projected } = revenue;

  return (
    <section className="arev" aria-label="Revenue summary">
      <div className="arev__headline">
        <span className="arev__eyebrow">Collected</span>
        <strong className="arev__total">{dollars(collected.cents)}</strong>
      </div>

      <div className="arev__group">
        <Line
          label="Food trucks"
          sub={countOf(collected.truck.count, 'truck', 'trucks')}
          value={dollars(collected.truck.cents)}
        />
        <Line
          label="Vendor booths"
          sub={countOf(collected.booth.count, 'booth', 'booths')}
          value={dollars(collected.booth.cents)}
        />
        <Line
          label="Alice orgs"
          sub={countOf(collected.free.count, 'org', 'orgs')}
          value={dollars(collected.free.cents)}
          muted
        />
      </div>

      <div className="arev__group">
        <span className="arev__grouplabel">How it came in</span>
        <Line
          label="Square"
          sub={countOf(bySource.square.count, 'payment', 'payments')}
          value={dollars(bySource.square.cents)}
        />
        <Line
          label="Prepaid"
          sub={countOf(bySource.prepaid.count, 'vendor', 'vendors')}
          value={dollars(bySource.prepaid.cents)}
        />
      </div>

      <div className="arev__group">
        <span className="arev__grouplabel">Still out</span>
        <Line
          label="Unpaid, checkout started"
          sub={countOf(outstanding.count, 'application', 'applications')}
          value={dollars(outstanding.cents)}
        />
      </div>

      <div className="arev__group">
        <span className="arev__grouplabel">If the lot sold out</span>
        {projected.cents === null ? (
          <p className="arev__note">
            Set the booth and truck capacity on this event to project a full lot.
          </p>
        ) : (
          <>
            <Line label="Full capacity" value={dollars(projected.cents)} />
            {projected.gapCents !== null ? (
              <Line label="Left on the table" value={dollars(projected.gapCents)} muted />
            ) : null}
            {!projected.complete ? (
              <p className="arev__note">
                Partial: only the {projected.truck.cents !== null ? 'truck' : 'booth'} side has a
                capacity set.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
