import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { RACE_SLUG } from '@/lib/race';
import { getRace } from '@/lib/races';
import { raceDates } from '@/lib/race-dates';
import { supportEmail } from '@/lib/support';

/** Where Square sends a runner after they pay. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'You are registered',
  robots: { index: false, follow: false },
};

export default async function RegisteredPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [race, params] = await Promise.all([getRace(RACE_SLUG), searchParams]);

  /* Set when the registration saved and Square would not open checkout. The
     entry is real, the waiver is signed, and no money has moved. Saying "you
     are in" to that person and nothing else is how somebody turns up on race
     morning believing they paid. */
  const checkoutFailed = params.checkout === 'failed';

  return (
    <>
      <Nav />
      <main className="section" id="main">
        <div className="shell">
          <p className="eyebrow">Registered</p>
          <h1>{checkoutFailed ? 'You are registered, but not paid' : 'You are in'}</h1>

          {checkoutFailed ? (
            <>
              <p className="lede">
                Your registration and your waiver are saved. We could not open the payment page,
                so nothing has been charged and your entry is not paid yet.
              </p>
              <p className="race__hard">
                Do not fill the form in again. That would make a second entry for the same
                runner. We have been told, and we will email you a payment link to the address
                you registered with.
              </p>
              <p>
                If it has not arrived within a day, email{' '}
                <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a> and we will send it
                straight over. The spot is not held until the entry is paid.
              </p>
            </>
          ) : (
            <p className="lede">
              Your confirmation is on its way to the email you registered with. It has the date,
              the check in time and what your entry includes.
            </p>
          )}

          {race ? (
            <>
              <p className="race__hard">
                Every runner has to be checked in by {raceDates(race).checkInTime} for a{' '}
                {raceDates(race).startTime} start.
              </p>
              {race.packetPickup ? <p>{race.packetPickup}</p> : null}
            </>
          ) : null}

          {checkoutFailed ? null : (
            <p>
              Nothing arrived? Check the spam folder, then email{' '}
              <a href={`mailto:${supportEmail()}`}>{supportEmail()}</a> and we will sort it.
            </p>
          )}

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
