'use client';

import { useState } from 'react';

/**
 * Downloading a signed agreement.
 *
 * Fetched rather than linked. The route refuses to produce a PDF for a row it
 * cannot render faithfully — an unsigned row, or one stamped with a version
 * this site has no text for — and a plain link would answer that by navigating
 * the tracker to a page of error text. Here the error lands next to the button
 * that caused it and the list stays where it was.
 */

/** Turn a response body into a download without leaving the page. */
async function saveResponse(res: Response, fallbackName: string): Promise<void> {
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick rather than immediately: Safari has not finished
  // with the blob when click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM12 18l-3.5-3.5 1.4-1.4 1.1 1.1V10h2v4.2l1.1-1.1 1.4 1.4L12 18Z" />
    </svg>
  );
}

/**
 * One vendor's agreement, as the icon on a row.
 *
 * Sits beside the call button rather than inside the card's own tap target,
 * which is the whole card and opens the sheet.
 */
export function AgreementRowButton({
  id,
  businessName,
}: {
  id: string;
  businessName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/agreement?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        // No room for a message on a row, so it goes where it will be read.
        alert(await res.text());
        return;
      }
      await saveResponse(res, 'agreement.pdf');
    } catch {
      alert('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="vcard__doc"
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void download();
      }}
      aria-label={`Download the signed agreement for ${businessName}`}
      title="Download signed agreement"
    >
      {busy ? <span className="vcard__docbusy" aria-hidden="true" /> : <DocIcon />}
    </button>
  );
}

/** The same download, as a labelled button with room for an error. */
export function AgreementSheetButton({
  id,
  businessName,
  version,
}: {
  id: string;
  businessName: string;
  version: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agreement?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      await saveResponse(res, 'agreement.pdf');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agrdl">
      <button
        className="btn btn--sm btn--ghost agrdl__btn"
        type="button"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? 'Building the PDF…' : 'Download agreement'}
      </button>
      <p className="agrdl__note">
        The full {version} text {businessName} signed, with the signature record.
      </p>
      {error ? (
        <p className="agrdl__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Every signed agreement in the current scope, as one zip.
 *
 * Rendering a whole event takes long enough to need saying out loud, so the
 * button reports that it is working rather than looking hung.
 */
export function AgreementBulkDownload({
  eventSlug,
  scopeName,
  signedCount,
}: {
  eventSlug: string;
  scopeName: string;
  /** Rows in this scope with a signed agreement. Nothing to archive at zero. */
  signedCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agreements?event=${encodeURIComponent(eventSlug)}`);
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      await saveResponse(res, 'coyoteville-agreements.zip');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (!signedCount) return null;

  return (
    <div className="agrbulk">
      <button
        className="btn btn--sm btn--amber agrbulk__btn"
        type="button"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy
          ? `Building ${signedCount} agreements…`
          : `Download all ${signedCount} signed agreements`}
      </button>
      <p className="agrbulk__note">
        A zip of every signed agreement for {scopeName}, each one in the version that vendor
        actually signed, with a manifest.
      </p>
      {busy ? (
        <p className="agrbulk__quiet">
          Each PDF is rendered on the server. On a full event this takes a minute.
        </p>
      ) : null}
      {error ? (
        <p className="agrdl__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
