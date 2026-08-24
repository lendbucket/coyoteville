import Photo from './Photo';
import StringLights from './StringLights';
import { SITE_PHOTOS } from '@/lib/photos';
import { ADDRESS, NEXT_EVENT } from '@/lib/seo';

/**
 * Full bleed photographic hero. The photo runs edge to edge, a gradient scrim
 * carries the type, and the headline sits low and left rather than centred.
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

        <div className="hero__under">
          <p className="hero__lede">
            Coyoteville is a food truck park and live music venue on North Stadium Road. The
            trucks pull in, the lights come on and somebody is always playing. Bring the kids.
            Bring a chair.
          </p>

          <div className="hero__actions">
            <a className="btn btn--rust" href="#apply">
              Vend with us
            </a>
            <a className="btn btn--ghost" href="#visit">
              Find the park
            </a>
          </div>
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
      </div>
    </section>
  );
}
