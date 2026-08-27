import { ADDRESS, nextEventByDate, PRICING } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

export default function About() {
  /* The next event by date, resolved per render so the page moves on to the
     following one by itself once tonight is over. */
  const NEXT_EVENT_RESOLVED = nextEventByDate();

  const email = supportEmail();

  return (
    <section className="section section--char" id="about" aria-labelledby="about-title">
      <div className="shell about__grid">
        <div>
          <p className="eyebrow">The lot</p>
          <h2 id="about-title">About the park</h2>

          <p className="lede">
            Coyoteville is on North Stadium Road, between Alice High School and the stadium. We
            open at 4:00 PM before home games.
          </p>

          <p>
            The lot fills with food trucks and vendor booths from around Jim Wells County. Tacos,
            barbecue, kettle corn, lumpia, sweets, candles, shirts. There is live music most
            nights.
          </p>

          <p>
            Booths are {PRICING.booth.price} per event and truck spots are {PRICING.truck.price}.
            Alice organizations set up at no charge. We do not take a percentage of what anyone
            earns.
          </p>
        </div>

        <div className="factcard">
          <h3>Details</h3>
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
                {NEXT_EVENT_RESOLVED.name}, {NEXT_EVENT_RESOLVED.displayDate}, {NEXT_EVENT_RESOLVED.displayTime}
              </span>
            </li>
            <li>
              <span className="factlist__label">Admission</span>
              <span className="factlist__value">
                Free. Parking on the lot opens at kickoff for $10 per vehicle.
              </span>
            </li>
            <li>
              <span className="factlist__label">Questions</span>
              <span className="factlist__value">
                <a href={`mailto:${email}`}>{email}</a>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
