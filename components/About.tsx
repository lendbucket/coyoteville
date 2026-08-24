import { ADDRESS, NEXT_EVENT, SITE } from '@/lib/seo';

export default function About() {
  return (
    <section className="section section--cream" id="about" aria-labelledby="about-title">
      <div className="shell about__grid">
        <div>
          <p className="eyebrow">About the park</p>
          <h2 id="about-title">A food truck park built for Alice</h2>

          <p className="lede">
            Coyoteville sits on North Stadium Road, right between Alice High School and the
            stadium. It started simple. Get good local food in one place, put up some lights,
            get a band going and give folks a reason to stay out a little longer.
          </p>

          <p>
            On event nights the lot fills up with food trucks and vendor booths from around Jim
            Wells County. Tacos, barbecue, kettle corn, lumpia, sweets, candles, shirts, all of
            it. Somebody is on the speakers. Kids run around. Parking is right there and it does
            not cost you anything to walk in.
          </p>

          <p>
            We keep it easy for the folks who set up here too. Flat fee, no commission, and free
            spots for Coyote groups, booster clubs and nonprofits. This is a hometown lot. It
            works because Alice shows up.
          </p>
        </div>

        <div className="factcard">
          <h3>The short version</h3>
          <ul className="factlist">
            <li>
              <span className="factlist__label">Where</span>
              <span className="factlist__value">{ADDRESS.full}</span>
            </li>
            <li>
              <span className="factlist__label">Landmark</span>
              <span className="factlist__value">{ADDRESS.landmark}</span>
            </li>
            <li>
              <span className="factlist__label">County</span>
              <span className="factlist__value">{ADDRESS.county}</span>
            </li>
            <li>
              <span className="factlist__label">Next event</span>
              <span className="factlist__value">
                {NEXT_EVENT.name}, {NEXT_EVENT.displayDate}, {NEXT_EVENT.displayTime}
              </span>
            </li>
            <li>
              <span className="factlist__label">Getting in</span>
              <span className="factlist__value">Free to attend. Free parking.</span>
            </li>
            <li>
              <span className="factlist__label">Questions</span>
              <span className="factlist__value">
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
