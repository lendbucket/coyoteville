import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import VendorForm from '@/components/VendorForm';
import { checkPrepaidGate, tokenMatches } from '@/lib/prepaid';
import { EVENT_TIMEZONE, NEXT_EVENT } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

/**
 * Hidden prepaid vendor registration.
 *
 * Not linked from anywhere, kept out of the sitemap, and marked noindex. A
 * token that does not match returns a real 404 rather than a redirect, so the
 * response is indistinguishable from a route that does not exist.
 *
 * The link alone is the credential, and links get forwarded, so the expiry and
 * the registration cap in lib/prepaid stand behind it. Both are re-checked by
 * the API route, which is what actually enforces them.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor registration',
  description: 'Private registration link for vendors who have already paid for a Coyoteville spot.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

function formatDeadline(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIMEZONE,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(ms));
}

export default async function PrepaidPage({ params }: { params: { token: string } }) {
  // Wrong or missing token is a 404, not a hint that the route exists.
  if (!tokenMatches(params.token)) notFound();

  const gate = await checkPrepaidGate(NEXT_EVENT.slug);
  const email = supportEmail();

  const closedBody =
    gate.reason === 'expired' ? (
      <>
        This registration link expired
        {gate.expiresAtMs ? ` on ${formatDeadline(gate.expiresAtMs)} Central` : ''}. Email{' '}
        <a href={`mailto:${email}`}>{email}</a> and we will sort your spot out directly.
      </>
    ) : gate.reason === 'full' ? (
      <>
        Every prepaid spot for {NEXT_EVENT.name} has been registered. Email{' '}
        <a href={`mailto:${email}`}>{email}</a> if you believe this is wrong.
      </>
    ) : (
      <>
        This registration link is not available right now. Email{' '}
        <a href={`mailto:${email}`}>{email}</a> and we will get you registered.
      </>
    );

  return (
    <>
      <Nav />

      <main id="main">
        <VendorForm
          endpoint="/api/prepaid-registration"
          prepaid
          token={params.token}
          signupClosed={!gate.open}
          supportEmail={email}
          closedTitle={
            gate.reason === 'expired'
              ? 'This registration link has expired'
              : gate.reason === 'full'
                ? 'Prepaid registration is full'
                : 'Registration is not open'
          }
          closedBody={closedBody}
        />
      </main>

      <Footer />
    </>
  );
}
