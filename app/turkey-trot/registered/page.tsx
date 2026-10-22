import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { RACE_SLUG } from '@/lib/race';
import { getRace } from '@/lib/races';
import { supportEmail } from '@/lib/support';

/** Where Square sends a runner after they pay. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'You are registered',
  robots: { index: false, follow: false },
};

export default async function RegisteredPage() {
  const race = await getRace(RACE_SLUG);

  return (
    <>
      <Nav />
      <main className="section" id="main">
        <div className="shell">
          <p className="eyebrow">Registered</p>
          <h1>You are in</h1>

          <p className="lede">
            Your confirmation is on its way to the email you registered with. It has the date,
            the check in time and what your entry includes.
          </p>

          {race ? (
            <>
              <p className="race__hard">
                Every runner has to be checked in by 7:00 AM for an {race.displayTime} start.
              </p>
              {race.packetPickup ? <p>{race.packetPickup}</p> : null}
            </>
          ) : null}

          <p>
            Nothing arrived? Check the spam folder, then email{' '}
            <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a> and we will sort it.
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
