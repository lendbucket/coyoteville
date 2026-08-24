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

          <p className="confirm__script">You are in</p>
          <h1 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.9rem)' }}>Your spot is paid</h1>

          <p className="muted">
            We got your payment and your signed agreement. Your spot at {NEXT_EVENT.name} on{' '}
            {NEXT_EVENT.displayDate} is locked in. Check your email for the Square receipt.
          </p>

          <ul className="confirm__steps">
            <li>
              <strong>We will email you a spot number</strong> a few days before the event, along
              with what time to roll in and where to park.
            </li>
            <li>
              <strong>Bring your own everything.</strong> Tent, weights, tables, chairs,
              generator, fuel, water, cooking gear and a fire extinguisher.
            </li>
            <li>
              <strong>Have your permits on you.</strong> Health department paperwork and your food
              handler cards need to be on site.
            </li>
            <li>
              <strong>Grease and gray water leave with you.</strong> Nothing goes on the ground.
            </li>
          </ul>

          <p className="muted">
            Need to change something, email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>

          <p style={{ marginTop: '1.6rem' }}>
            <a className="btn btn--amber" href="/">
              Back to the park
            </a>
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
