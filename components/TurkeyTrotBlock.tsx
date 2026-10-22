import { RACE_ADDONS, dollars } from '@/lib/race';
import { HAS_LOGO, RACE_ASSETS } from '@/lib/race-assets';

/**
 * The Turkey Trot, on the homepage, right under the hero.
 *
 * Static, like the rest of the homepage. It names a date and two prices and
 * nothing that moves, so it needs no database read and the page stays a file on
 * a CDN. The two buttons are the two things somebody can do about it: run it,
 * or pay to put their name on it.
 */
export default function TurkeyTrotBlock() {
  return (
    <section className="section tt" aria-labelledby="tt-title">
      <div className="shell tt__in">
        {HAS_LOGO ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tt__logo" src={RACE_ASSETS.logo} alt="" width={160} height={160} />
        ) : null}

        <div className="tt__words">
          <p className="eyebrow">New for 2026</p>
          <h2 id="tt-title">The Coyoteville Turkey Trot</h2>
          <p className="tt__when">Saturday, November 14</p>
          <p className="lede">
            A run of approximately 3.1 miles through Alice, starting and finishing at the park.
            The streets are closed and the lot is open before and after.
          </p>

          <p className="tt__cta">
            <a className="btn btn--primary" href="/turkey-trot">
              Register
            </a>
            <a className="btn btn--ghost" href="/turkey-trot/sponsors">
              Sponsor the race
            </a>
          </p>

          <p className="tt__nights">
            Two nights for vendors around it. Friday November 13 is packet pickup with trucks
            and vendors open at 5:30 PM, and Saturday November 14 they open at 6:00 AM for
            breakfast before the start. Food truck $65, vendor booth $35.{' '}
            <a href="/#apply">Book a spot</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
