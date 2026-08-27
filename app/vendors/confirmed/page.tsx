import type { Metadata } from 'next';
import DeadlineBarMount from '@/components/DeadlineBarMount';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import NextSteps from '@/components/NextSteps';
import { NEXT_EVENT } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Vendor spot confirmed',
  description: 'Your Coyoteville vendor spot is paid and confirmed.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function ConfirmedPage({
  searchParams,
}: {
  searchParams: { spot?: string };
}) {
  const email = supportEmail();

  return (
    <>
      <DeadlineBarMount />
      <Nav />

      <main id="main" className="confirm">
        <div className="shell confirm__card">
          <StringLights tone="dark" variant="top" swags={4} sag={26} bulbsPerSwag={6} id="confirm-lights" />

          <p className="confirm__script">Confirmed</p>
          <h1 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.9rem)' }}>Your spot is paid</h1>

          <p className="muted">
            We have your payment and your signed agreement. Your spot at {NEXT_EVENT.name} on{' '}
            {NEXT_EVENT.displayDate} is confirmed. Square sends the receipt to your email.
          </p>

          <ul className="confirm__steps">
            <li>
              <strong>We will email your spot number</strong> a few days before the event, with
              your setup time.
            </li>
            <li>
              <strong>Bring your own setup.</strong> Table, chairs, canopy, decorations,
              weights, generator, fuel, water, cooking gear and a fire extinguisher. One vehicle
              per space.
            </li>
            <li>
              <strong>Keep your permits on site.</strong> Bring your Texas DSHS health permit and
              food handler certificates to the event, not at home.
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
