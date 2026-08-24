import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import { NEXT_EVENT, SITE } from '@/lib/seo';

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

export default function ConfirmedPage() {
  return (
    <>
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
              <strong>Keep your permits on site.</strong> Food handler and health permits have to
              be with you at the event.
            </li>
            <li>
              <strong>Grease and gray water leave with you.</strong> Nothing is discharged on the
              lot.
            </li>
          </ul>

          <p className="muted">
            To change anything, email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>

          <p style={{ marginTop: '1.6rem' }}>
            <a className="btn btn--amber" href="/">
              Back to the site
            </a>
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
