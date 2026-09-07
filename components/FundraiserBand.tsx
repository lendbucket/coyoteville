import { PARKING_PRICE_CENTS, PROGRAM_NAME, dollars } from '@/lib/parking-fundraiser';

/**
 * The fundraiser, on the homepage, immediately after the hero.
 *
 * A flyer went up around Alice with the program name and coyoteville.com on it
 * and nothing else. Somebody who reads it types the domain, not the path, so
 * they land on the homepage, and until this band existed the thing they were
 * sent here for was five screens down inside the nav under a different word.
 *
 * Deliberately short. One number, one sentence, one button. The band is the
 * signpost; /parking-fundraiser is the page that does the explaining.
 *
 * A Server Component with no state, no props and no data read, so the homepage
 * stays static at ISR. That is the constraint this had to be designed inside:
 * anything that needed the events table here would have cost the whole page its
 * prerender to save one query.
 */
export default function FundraiserBand() {
  return (
    <section className="section fband" aria-labelledby="fband-title">
      <div className="shell fband__inner">
        <p className="eyebrow">For local organizations</p>
        <h2 id="fband-title" className="fband__claim">
          50% of parking revenue goes to your organization
        </h2>
        <p className="lede fband__lede">
          Schools, booster clubs, teams, clubs and community groups: work a game day at Coyoteville
          and keep half of every {dollars(PARKING_PRICE_CENTS)} parked, paid within the week and
          posted publicly.
        </p>
        <p>
          <a className="btn btn--amber" href="/parking-fundraiser">
            See the {PROGRAM_NAME}
          </a>
        </p>
      </div>
    </section>
  );
}
