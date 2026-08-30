'use client';

import { AgreementRowButton } from './AgreementDownload';
import { isSettled, needsReview, type VendorCardRow } from './types';

/**
 * One vendor, as a card.
 *
 * The whole card is the tap target for the detail sheet, so there is no small
 * chevron to hit one handed. The call button sits on top of it as its own
 * target, because ringing someone is the single most common thing done from
 * this list and it should never cost two taps.
 *
 * A checkbox appears only in selection mode. Showing it always would put a
 * 44px control on every row for a job that is done occasionally.
 */
export default function VendorCard({
  row,
  onOpen,
  selectable,
  selected,
  onToggle,
}: {
  row: VendorCardRow;
  onOpen: (id: string) => void;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const settled = isSettled(row);
  const waiting = needsReview(row);
  const tel = row.phone.replace(/[^\d+]/g, '');

  return (
    <li className={`vcard ${selected ? 'vcard--selected' : ''} ${waiting ? 'vcard--review' : ''}`}>
      {selectable ? (
        <label className="vcard__check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(row.id)}
            aria-label={`Select ${row.businessName}`}
          />
          <span aria-hidden="true" />
        </label>
      ) : null}

      <button
        type="button"
        className="vcard__body"
        onClick={() => onOpen(row.id)}
        aria-label={`Open ${row.businessName}`}
      >
        <span className="vcard__top">
          <span className="vcard__name">{row.businessName}</span>
          <span className={`pill ${settled ? 'pill--ok' : 'pill--warn'}`}>
            {row.paymentStatus === 'not_required' ? 'Free' : row.paymentStatus}
            {row.amountLabel ? ` ${row.amountLabel}` : ''}
          </span>
        </span>

        <span className="vcard__badges">
          <span className={`badge badge--${row.spotType}`}>{row.spotTypeLabel}</span>
          {row.spotNumber ? <span className="badge badge--spot">Spot {row.spotNumber}</span> : null}
          {waiting ? (
            <span className="badge badge--review">Needs review</span>
          ) : row.approvalStatus === 'approved' ? (
            <span className="badge badge--ok">Approved</span>
          ) : row.approvalStatus === 'denied' ? (
            <span className="badge badge--off">Denied</span>
          ) : null}
        </span>

        <span className="vcard__meta">
          {row.contactName}
          {row.sells ? ` · ${row.sells}` : ''}
        </span>

        {/* What they booked, only where it is not obvious. In an event scope
            every row is the same event and saying so on each one is noise; a
            day or a permanent spot is the thing you are scanning for. */}
        {row.bookingKind !== 'event' ? (
          <span className="vcard__booking">{row.bookingLabel}</span>
        ) : null}
      </button>

      {/* Only where there is something to produce. An unsigned row has no
          agreement, and an icon that always errors is worse than no icon. */}
      {row.signed ? <AgreementRowButton id={row.id} businessName={row.businessName} /> : null}

      <a
        className="vcard__call"
        href={`tel:${tel}`}
        aria-label={`Call ${row.contactName} at ${row.phone}`}
        onClick={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.03-.24 11.4 11.4 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.03l-2.2 2.19Z" />
        </svg>
      </a>
    </li>
  );
}
