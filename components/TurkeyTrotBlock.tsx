import { RACE_SLUG } from '@/lib/race';
import { PRICING } from '@/lib/seo';
import { getRaceNights } from '@/lib/race-events';
import { HAS_LOGO, HAS_VIDEO, RACE_ASSETS } from '@/lib/race-assets';
import { raceDates } from '@/lib/race-dates';
import { getRace } from '@/lib/races';
import RaceAdLoop from '@/components/race/RaceAdLoop';

/**
 * The Turkey Trot, on the homepage, right under the hero.
 *
 * Static, like the rest of the homepage. It names a date and two prices and
 * nothing that moves, so it needs no database read and the page stays a file on
 * a CDN. The two buttons are the two things somebody can do about it: run it,
 * or pay to put their name on it.
 */
export default async function TurkeyTrotBlock() {
  const race = await getRace(RACE_SLUG);
  const nights = await getRaceNights();
  /* The date comes off the row, like every other date on this site. */
  const when = race ? raceDates(race).startWeekday : null;

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
          {when ? <p className="tt__when">{when}</p> : null}
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

          {/* Both nights off their event rows, same as the race page. */}
          <p className="tt__nights">
            {nights.pickup && nights.morning ? (
              <>
                Two nights for vendors around it. {nights.pickup.weekday} is packet pickup with
                trucks and vendors open at {nights.pickup.opens}, and {nights.morning.weekday}{' '}
                they open at {nights.morning.opens} for breakfast before the start.
              </>
            ) : (
              <>
                Two nights for vendors around it, the evening before the race and race morning.
              </>
            )}{' '}
            Food truck {PRICING.truck.price}, vendor booth {PRICING.booth.price}.{' '}
            <a href="/#apply">Book a spot</a>.
          </p>
        </div>

        {/* The loop. Downloads nothing until somebody scrolls to it, which on
            the homepage is most of the point. */}
        {HAS_VIDEO ? (
          <RaceAdLoop src={RACE_ASSETS.video} logo={HAS_LOGO ? RACE_ASSETS.logo : null} />
        ) : null}
      </div>
    </section>
  );
}
