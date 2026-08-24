import { ADDRESS, MAPS_URL, NEXT_EVENT, SITE } from '@/lib/seo';

export default function Visit() {
  return (
    <section className="section section--char" id="visit" aria-labelledby="visit-title">
      <div className="shell visit__grid">
        <div>
          <p className="eyebrow">Directions</p>
          <h2 id="visit-title">Find the park</h2>

          <address className="address">
            <strong>{SITE.name}</strong>
            {ADDRESS.street}
            <br />
            {ADDRESS.city}, {ADDRESS.state} {ADDRESS.zip}
            <br />
            {ADDRESS.county}
          </address>

          <p style={{ marginTop: '1.2rem' }}>{ADDRESS.landmark}</p>

          <a className="btn btn--primary" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
            Get directions
          </a>
        </div>

        <div className="factcard">
          <h3>Before you head out</h3>
          <ul className="factlist">
            <li>
              <span className="factlist__label">Next event</span>
              <span className="factlist__value">
                {NEXT_EVENT.name}, {NEXT_EVENT.displayDate} at {NEXT_EVENT.displayTime}
              </span>
            </li>
            <li>
              <span className="factlist__label">Admission</span>
              <span className="factlist__value">Free. There is no cover and no ticket.</span>
            </li>
            <li>
              <span className="factlist__label">Parking</span>
              <span className="factlist__value">
                Parking opens on the lot at kickoff for $10 per vehicle.
              </span>
            </li>
            <li>
              <span className="factlist__label">Shuttles</span>
              <span className="factlist__value">
                Shuttles run to the stadium once the game starts.
              </span>
            </li>
            <li>
              <span className="factlist__label">Bring</span>
              <span className="factlist__value">
                A chair if you want to sit. Most trucks take cash and cards.
              </span>
            </li>
            <li>
              <span className="factlist__label">Weather</span>
              <span className="factlist__value">
                We run rain or shine. Check Facebook the day of if the weather looks bad.
              </span>
            </li>
            <li>
              <span className="factlist__label">Follow along</span>
              <span className="factlist__value">
                <a href={SITE.facebook} target="_blank" rel="noopener noreferrer">
                  facebook.com/coyoteville
                </a>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
