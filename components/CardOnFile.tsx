'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The card form for a permanent monthly spot.
 *
 * Square's Web Payments SDK, loaded from Square's own CDN and rendered into an
 * iframe it controls. That is not an implementation detail worth working
 * around: the card number never touches this page's DOM and never reaches our
 * server, which is the whole reason to use it rather than three text inputs.
 * What comes back is a single use token.
 *
 * Nothing is charged here. The token is exchanged server side for a card stored
 * against a Square customer, and the subscription that actually bills it is
 * only created when the application is approved. The copy says so, because a
 * card form with no explanation of when it will be charged is how a recurring
 * signup becomes a dispute.
 */

type SquareCard = {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{
    status: string;
    token?: string;
    errors?: { message?: string }[];
  }>;
  destroy?: () => Promise<void>;
};

type SquarePayments = {
  card: (options?: Record<string, unknown>) => Promise<SquareCard>;
  verifyBuyer?: (
    token: string,
    details: Record<string, unknown>
  ) => Promise<{ token?: string } | null>;
};

declare global {
  interface Window {
    Square?: {
      payments: (applicationId: string, locationId: string) => SquarePayments;
    };
  }
}

const SANDBOX_SRC = 'https://sandbox.web.squarecdn.com/v1/square.js';
const PRODUCTION_SRC = 'https://web.squarecdn.com/v1/square.js';

/** Load the SDK once per page, however many times this mounts. */
let sdkPromise: Promise<void> | null = null;

function loadSdk(src: string): Promise<void> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    if (window.Square) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Cleared so a later mount can try again rather than being stuck with a
      // rejected promise for the life of the page.
      sdkPromise = null;
      reject(new Error('Square could not be loaded.'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export type CardHandle = {
  /** Tokenise, or throw with a message worth showing. */
  tokenize: () => Promise<{ token: string; verificationToken?: string }>;
};

export default function CardOnFile({
  applicationId,
  locationId,
  environment,
  amountCents,
  contactName,
  email,
  onReady,
}: {
  /** NEXT_PUBLIC_SQUARE_APPLICATION_ID, passed down from the server. */
  applicationId: string;
  locationId: string;
  environment: 'sandbox' | 'production';
  /** The monthly fee, used only for the buyer verification challenge. */
  amountCents: number;
  contactName: string;
  email: string;
  /** Handed the tokenise function once the form is live, or null when it is not. */
  onReady: (handle: CardHandle | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<SquareCard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Held in refs so the tokenise closure always reads the current values
  // without the card having to be torn down and rebuilt on every keystroke in
  // the name field.
  const buyer = useRef({ contactName, email, amountCents });
  buyer.current = { contactName, email, amountCents };

  useEffect(() => {
    if (!applicationId || !locationId) {
      setStatus('error');
      setError('Card payments are not configured on this site yet.');
      onReady(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadSdk(environment === 'production' ? PRODUCTION_SRC : SANDBOX_SRC);
        if (cancelled || !window.Square) return;

        const payments = window.Square.payments(applicationId, locationId);
        const card = await payments.card({
          // Matched to the site inputs so the iframe does not read as a
          // borrowed widget dropped into the middle of the form.
          style: {
            input: { color: '#F3EEE5', fontSize: '17px' },
            '.input-container': {
              borderColor: 'rgba(247, 240, 226, 0.2)',
              borderRadius: '9px',
            },
            '.input-container.is-focus': { borderColor: '#F0A94B' },
            '.input-container.is-error': { borderColor: '#C4552B' },
            '.message-text': { color: '#B9B2A6' },
            '.message-text.is-error': { color: '#FFCDB6' },
          },
        });

        if (cancelled) {
          await card.destroy?.();
          return;
        }

        await card.attach('#cv-card-container');
        cardRef.current = card;
        setStatus('ready');

        onReady({
          tokenize: async () => {
            const result = await card.tokenize();

            if (result.status !== 'OK' || !result.token) {
              throw new Error(
                result.errors?.[0]?.message ||
                  'That card was not accepted. Check the number and try again.'
              );
            }

            /* Strong Customer Authentication. Square only challenges when the
               issuer asks for it, and a failure here is not fatal: the card is
               being stored rather than charged, so the token is still usable
               and the verification simply rides along when there is one. */
            let verificationToken: string | undefined;
            try {
              const verified = await payments.verifyBuyer?.(result.token, {
                intent: 'STORE',
                billingContact: {
                  givenName: buyer.current.contactName.slice(0, 60),
                  // Omitted rather than sent empty: Square validates the shape
                  // of what it is given, and an empty string is not an address.
                  ...(buyer.current.email ? { email: buyer.current.email } : {}),
                },
              });
              verificationToken = verified?.token;
            } catch {
              // Left undefined. The store still goes ahead.
            }

            return { token: result.token, verificationToken };
          },
        });
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'The card form could not be loaded. Refresh and try again.'
        );
        onReady(null);
      }
    })();

    return () => {
      cancelled = true;
      void cardRef.current?.destroy?.();
      cardRef.current = null;
      onReady(null);
    };
    // Rebuilt only when the Square target changes. The buyer details ride in
    // through the ref above, so typing a name does not tear the iframe down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, locationId, environment]);

  return (
    <div className="cardfile">
      <span className="label">Card for the monthly charge</span>

      <div className="cardfile__box">
        <div id="cv-card-container" ref={containerRef} />
        {status === 'loading' ? <p className="hint">Loading the secure card form…</p> : null}
        {status === 'error' && error ? (
          <p className="formnote formnote--error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <span className="hint">
        Handled by Square. Your card details go straight to them and never touch our servers.{' '}
        <b>Nothing is charged now.</b> We take the first payment only if we approve your
        application.
      </span>
    </div>
  );
}
