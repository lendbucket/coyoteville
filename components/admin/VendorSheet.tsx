'use client';

import { useEffect, useRef } from 'react';
import AdminRowControls from '../AdminRowControls';
import AdminSendPhotos from '../AdminSendPhotos';
import { AgreementSheetButton } from './AgreementDownload';
import ReviewControls from './ReviewControls';
import SubscriptionControls from './SubscriptionControls';
import { isSettled, type VendorCardRow } from './types';

/**
 * The detail sheet: everything about one vendor, slid up over the list.
 *
 * A sheet rather than a route because the list stays where it was. Scrolling to
 * a vendor, opening them, and landing back at the top of the list afterwards is
 * the thing that makes a phone tool feel wrong, and a sheet never does it.
 *
 * Dismissable three ways, since one handed use means the close button is not
 * always reachable: the backdrop, Escape, and dragging the grab handle down.
 */
export default function VendorSheet({
  row,
  onClose,
  onEmail,
}: {
  row: VendorCardRow | null;
  onClose: () => void;
  onEmail: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (!row) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Stop the list behind from scrolling while the sheet is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [row, onClose]);

  if (!row) return null;

  const tel = row.phone.replace(/[^\d+]/g, '');
  const settled = isSettled(row);

  /* Drag the handle down far enough and it closes. Anything less snaps back,
     so a stray touch while scrolling does not dismiss the sheet. */
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null || !panel.current) return;
    const delta = e.touches[0].clientY - dragStart.current;
    if (delta > 0) panel.current.style.transform = `translateY(${delta}px)`;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current === null || !panel.current) return;
    const delta = e.changedTouches[0].clientY - dragStart.current;
    panel.current.style.transform = '';
    dragStart.current = null;
    if (delta > 110) onClose();
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={row.businessName}>
      <button className="sheet__scrim" type="button" onClick={onClose} aria-label="Close" />

      <div className="sheet__panel" ref={panel}>
        <div
          className="sheet__grab"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span />
        </div>

        <div className="sheet__scroll">
          <header className="sheet__head">
            <h2 className="sheet__name">{row.businessName}</h2>
            <p className="sheet__sub">{row.contactName}</p>
            <div className="vcard__badges">
              <span className={`badge badge--${row.spotType}`}>{row.spotTypeLabel}</span>
              {row.spotNumber ? <span className="badge badge--spot">Spot {row.spotNumber}</span> : null}
              <span className={`pill ${settled ? 'pill--ok' : 'pill--warn'}`}>
                {row.paymentStatus === 'not_required' ? 'Free' : row.paymentStatus}
                {row.amountLabel ? ` ${row.amountLabel}` : ''}
              </span>
            </div>
          </header>

          {/* One tap each, in the order they get used at the gate. */}
          <div className="sheet__actions">
            <a className="act" href={`tel:${tel}`}>
              <span className="act__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.03-.24 11.4 11.4 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.03l-2.2 2.19Z" />
                </svg>
              </span>
              Call
            </a>

            <button className="act" type="button" onClick={() => onEmail(row.id)}>
              <span className="act__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.24-8 4.63-8-4.63V6l8 4.63L20 6v2.24Z" />
                </svg>
              </span>
              Email
            </button>

            <a className="act" href={`mailto:${row.email}`}>
              <span className="act__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 2a10 10 0 1 0 4.5 18.93l-.9-1.79A8 8 0 1 1 20 12v1.25a1.25 1.25 0 0 1-2.5 0V12a5.5 5.5 0 1 0-1.9 4.15A3.25 3.25 0 0 0 22 13.25V12A10 10 0 0 0 12 2Zm0 15.5a5.5 5.5 0 0 1 0-11 5.5 5.5 0 0 1 0 11Zm0-8.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Z" />
                </svg>
              </span>
              Mail app
            </a>
          </div>

          {/* The decision comes before the housekeeping controls, because on a
              pending vendor it is the only reason this sheet was opened. */}
          <div className="sheet__block">
            <ReviewControls
              id={row.id}
              businessName={row.businessName}
              approvalStatus={row.approvalStatus}
              amountLabel={row.amountLabel}
              denialReason={row.denialReason}
              refundLabel={row.refundLabel}
              refundError={row.refundError}
            />
          </div>

          <div className="sheet__block">
            <AdminRowControls
              id={row.id}
              approvalStatus={row.approvalStatus}
              spotNumber={row.spotNumber}
            />
          </div>

          {row.bookingKind === 'monthly' ? (
            <div className="sheet__block">
              <SubscriptionControls
                id={row.id}
                businessName={row.businessName}
                status={row.subscriptionStatus}
                periodEnd={row.subscriptionPeriodEnd}
                canceling={row.subscriptionCanceling}
                monthlyLabel={row.monthlyLabel}
                failedPayments={row.failedPayments}
                approved={row.approvalStatus === 'approved'}
              />
            </div>
          ) : null}

          <div className="sheet__block">
            <AdminSendPhotos
              id={row.id}
              businessName={row.businessName}
              fileCount={row.fileCount}
              lastSend={row.lastPhotoSend}
            />
          </div>

          <dl className="sheet__facts">
            <div>
              <dt>Booked</dt>
              <dd>{row.bookingLabel}</dd>
            </div>
            <div>
              <dt>Sells</dt>
              <dd>
                {row.sells}
                {row.servesFood ? ' · serves food' : ''}
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${tel}`}>{row.phone}</a>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${row.email}`}>{row.email}</a>
              </dd>
            </div>
            <div>
              <dt>Agreement</dt>
              <dd>
                {row.signed ? (
                  <>
                    Signed by <b>{row.signatureName}</b>
                    <br />
                    {row.signedAt} · {row.agreementVersion}
                    <AgreementSheetButton
                      id={row.id}
                      businessName={row.businessName}
                      version={row.agreementVersion}
                    />
                  </>
                ) : (
                  <span className="sheet__missing">Not signed</span>
                )}
              </dd>
            </div>
            <div>
              <dt>DSHS health permit</dt>
              <dd>
                {row.permitUploaded ? (
                  <a href={`/api/admin/file?id=${row.id}&kind=permit`} target="_blank" rel="noreferrer">
                    Open permit
                  </a>
                ) : (
                  <span className="sheet__missing">Not uploaded</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Media</dt>
              <dd>
                {row.logoUploaded ? 'Logo' : 'No logo'} · {row.photoCount} photo
                {row.photoCount === 1 ? '' : 's'}
              </dd>
            </div>
            {row.lastEmail ? (
              <div>
                <dt>Last email</dt>
                <dd>
                  {row.lastEmail.subject}
                  <br />
                  {new Date(row.lastEmail.at).toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
            ) : null}
            {row.uploadIssues ? (
              <div>
                <dt>Upload issues</dt>
                <dd className="sheet__missing">{row.uploadIssues}</dd>
              </div>
            ) : null}
            <div>
              <dt>Applied</dt>
              <dd>{row.appliedAt}</dd>
            </div>
          </dl>

          <button className="btn btn--ghost sheet__close" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
