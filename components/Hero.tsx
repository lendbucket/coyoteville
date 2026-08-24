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
          Trucks, live music, and somewhere for this town to actually go on a Friday night. Right
          across from the stadium.
        </p>
      </div>

      <div className="hero__truck">
        <FoodTruck id="hero-truck" />
      </div>

      <div className="hero__actions">
        <a className="btn btn--rust" href="#apply">
          Reserve your spot
        </a>
        <a className="btn btn--ghost" href="#vendors">
          See who is coming
        </a>
      </div>

      <p className="hero__meta">
        <span>Next up: {NEXT_EVENT.name}</span>
        <span>
          <time dateTime={NEXT_EVENT.startISO}>
            {NEXT_EVENT.displayDate} at {NEXT_EVENT.displayTime}
          </time>
        </span>
        <span>Free to attend. Free parking.</span>
      </p>
    </section>
  );
}
