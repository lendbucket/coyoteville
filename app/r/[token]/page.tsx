import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StringLights from '@/components/StringLights';
import { supportEmail } from '@/lib/support';

/**
 * The retired prepaid registration link.
 *
 * This route used to register vendors who had paid off the site: no payment
 * step, and a database function that stamped the row paid and approved on the
 * strength of the form being submitted. It existed for the August 28 launch
 * event, the token went to eighteen vendors, and it kept working afterwards.
 * One vendor registered through it for the September event, which produced a
 * row saying paid and approved with no money behind it.
 *
 * So the entry point is gone rather than gated. There is no token check here,
 * no environment variable, and no database call: the page renders the same
 * notice whatever is in the URL, because there is nothing left to protect and
 * nothing left to switch back on. Turning it on again means writing the route
 * again, which is the point. A flag would have been one dashboard edit away
 * from live, and the eighteen people holding the old link are exactly the
 * people who would find it.
 *
 * What is deliberately NOT removed:
 *   - register_prepaid_vendor in the database. Dropping it would be a schema
 *     change to remove a function nothing calls.
 *   - The eighteen offline rows. Real vendors, real records for August 28, and
 *     the tracker reconciles cash against them.
 *
 * Anyone arriving here is a vendor holding a link that was handed to them
 * personally, so this points them at the ordinary signup rather than 404ing.
 */

export const metadata: Metadata = {
  title: 'This registration link has been retired',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RetiredPrepaidPage() {
  const email = supportEmail();

  return (
    <>
      <Nav />

      <main id="main">
        <section className="section apply" aria-labelledby="retired-title">
          <StringLights tone="dark" variant="top" swags={5} sag={30} id="retired-lights" />

          <div className="shell">
            <p className="eyebrow">Vendor registration</p>
            <h2 id="retired-title">This registration link has been retired</h2>

            <p className="lede muted">
              It was for the August 28 Tailgate Kickoff and is no longer in use. Nothing you do
              here will register you.
            </p>

            <p className="lede muted">
              To book a spot at the next event, apply the normal way. It takes a couple of
              minutes and you pay at the end.
            </p>

            <p className="retired__cta">
              <Link className="btn btn--amber" href="/#apply">
                Apply for a spot
              </Link>
            </p>

            <p className="hint">
              Already paid us for a date and not sure where you stand? Email{' '}
              <a href={`mailto:${email}`}>{email}</a> and we will sort it out directly rather
              than sending you round the form again.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
