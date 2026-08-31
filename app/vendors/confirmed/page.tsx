import type { Metadata } from 'next';
import DeadlineBarMount from '@/components/DeadlineBarMount';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import NextSteps from '@/components/NextSteps';
import Fireworks from '@/components/Fireworks';
import { nextEventByDate } from '@/lib/seo';
import { REFUND_WINDOW, REVIEW_WINDOW } from '@/lib/approval';
import { supportEmail } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Application received',
  description: 'Your Coyoteville vendor application is paid and in review.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Where Square drops a vendor after checkout.
 *
 * This page used to say the spot was confirmed, which is no longer true: the
 * payment has settled and the application has joined the review queue. The
 * celebration stays, because finishing signup is still a real moment and this
 * is still the end of a long form, but every line under it is careful not to
 * promise a spot that has not been granted yet.
 */
export default function ConfirmedPage({
  searchParams,
}: {
  searchParams: { spot?: string };
}) {
  const email = supportEmail();
  const free = searchParams.spot === 'free';

  /* The event they are now queued for, resolved against the clock. This named
     NEXT_EVENT, which never advances, so the page thanked people for applying
     to an event that had already happened. */
  const nextEvent = nextEventByDate();

  return (
    <>
      <DeadlineBarMount />
      <Nav />

      <main id="main" className="confirm">
        <StringLights tone="dark" variant="top" swags={4} sag={26} bulbsPerSwag={6} id="confirm-lights" />
        <Fireworks />

        <div className="shell confirm__card">
          <p className="confirm__script">Thank you</p>
          <h1 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.9rem)' }}>We have your application</h1>

          <p className="muted">
            {free
              ? 'We have your signed agreement. Nothing was charged.'
              : 'We have your payment and your signed agreement. Square sends the receipt to your email.'}{' '}
            You are in the queue for {nextEvent.name} on {nextEvent.displayDate}.
          </p>

          {/* The rule, stated the same way it was stated before they paid and
              the same way the email states it. Somebody who reads all three and
              gets three different promises has been told nothing. */}
          <p className="formnote formnote--warn confirm__review" role="note">
            <b>This is not a confirmed spot yet.</b> {free ? 'Your application' : 'Paying'} reserves
            your place in the review queue. We review every application {REVIEW_WINDOW} and email
            you either way.{' '}
            {free
              ? 'Nothing was charged, so there is nothing to refund if we cannot fit you in.'
              : `If we cannot accommodate you, you are refunded in full automatically, and it takes ${REFUND_WINDOW} to appear on your statement.`}
          </p>

          <ul className="confirm__steps">
            <li>
              <strong>Watch for our email.</strong> Approved or not, you hear from us{' '}
              {REVIEW_WINDOW}. The approval email carries your spot details and setup time.
            </li>
            <li>
              <strong>Hold off on buying stock</strong> or booking help for this date until that
              email lands.
            </li>
            <li>
              <strong>Keep your permits ready.</strong> If you are approved, bring your Texas DSHS
              health permit and food handler certificates to the event, not at home.
            </li>
            <li>
              <strong>Grease and gray water leave with you.</strong> Nothing is discharged on the
              lot.
            </li>
          </ul>

          <p className="muted">
            To change anything, email <a href={`mailto:${email}`}>{email}</a>.
          </p>

          <p style={{ marginTop: '1.6rem' }}>
            <a className="btn btn--amber" href="/">
              Back to the site
            </a>
          </p>
        </div>

        <NextSteps spot={searchParams.spot} id="confirmed-next" />
      </main>

      <Footer />
    </>
  );
}
