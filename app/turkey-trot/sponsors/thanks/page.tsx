import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { RACE_SLUG } from '@/lib/race';
import { getRace } from '@/lib/races';
import { supportEmail } from '@/lib/support';

/** Where Square sends a sponsor after they pay. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Thank you for sponsoring',
  robots: { index: false, follow: false },
};

export default async function SponsorThanksPage() {
  const race = await getRace(RACE_SLUG);

  const shirtDeadline = race
    ? new Date(Date.parse(race.shirtDeadlineAtISO)).toLocaleDateString('en-US', {
        timeZone: 'America/Chicago',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const passed = race ? Date.now() > Date.parse(race.shirtDeadlineAtISO) : false;

  return (
    <>
      <Nav />
      <main className="section" id="main">
        <div className="shell">
          <p className="eyebrow">Sponsorship</p>
          <h1>Thank you</h1>

          <p className="lede">
            You are in. We will email a confirmation with everything your level includes and
            what we need from you.
          </p>

          {shirtDeadline && !passed ? (
            <p className="race__hard">
              If your level includes the shirt, we need your artwork by {shirtDeadline}. A
              vector file or a high resolution PNG with a transparent background.
            </p>
          ) : null}

          <p>
            Anything at all, email <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a>.
          </p>

          <p className="race__cta">
            <a className="btn btn--primary" href="/turkey-trot">
              Back to the race
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
