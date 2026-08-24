import Photo from './Photo';
import StringLights from './StringLights';
import FoodTruck from './FoodTruck';
import { SITE_PHOTOS } from '@/lib/photos';
import { ADDRESS, NEXT_EVENT } from '@/lib/seo';

/**
 * Full bleed photographic hero. The photo runs edge to edge, a gradient scrim
 * carries the type, and the food truck illustration sits on the horizon line
 * between the headline and the fold.
 */
export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__bg">
        <Photo photo={SITE_PHOTOS.hero} sizes="100vw" priority cover />
      </div>
      <div className="hero__scrim" aria-hidden="true" />
      <div className="hero__tint" aria-hidden="true" />

      <StringLights tone="dark" variant="top" swags={6} sag={40} bulbsPerSwag={7} id="hero-lights" />

      <div className="shell hero__body">
        <p className="hero__tagline">
          {ADDRESS.city}, {ADDRESS.state} &middot; {ADDRESS.street}
        </p>

        <h1 id="hero-title">
          Food Truck Park
          <span className="hero__line2">
            {ADDRESS.city}, {ADDRESS.state}
          </span>
        </h1>

        <p className="hero__lede">
          Coyoteville is an outdoor food truck park on North Stadium Road, directly across from
          the stadium. We open at 4:00 PM before home games. Admission is free and everyone is
          welcome.
        </p>
      </div>

      <div className="hero__truck">
        <FoodTruck id="hero-truck" />
      </div>

      <div className="hero__actions">
        <a className="btn btn--rust" href="#apply">
          Apply for a spot
        </a>
        <a className="btn btn--ghost" href="#vendors">
          Vendor spots and prices
        </a>
      </div>

      <p className="hero__meta">
        <span>{NEXT_EVENT.name}</span>
        <span>
          <time dateTime={NEXT_EVENT.startISO}>
            {NEXT_EVENT.displayDate} at {NEXT_EVENT.displayTime}
          </time>
        </span>
        <span>Admission is free</span>
      </p>
    </section>
  );
}
