import StringLights from './StringLights';
import { ADDRESS, NEXT_EVENT } from '@/lib/seo';

export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <StringLights tone="dark" variant="top" swags={6} sag={40} bulbsPerSwag={7} id="hero-lights" />

      <div className="shell hero__body">
        <p className="hero__script">Good food, live music</p>

        <h1 id="hero-title">Food Truck Park in Alice TX</h1>

        <p className="hero__lede">
          Coyoteville is a food truck park and live music venue on North Stadium Road in Alice.
          The trucks pull in, the lights come on and somebody is always playing. Bring the kids.
          Bring a chair.
        </p>

        <div className="hero__actions">
          <a className="btn btn--amber" href="#apply">
            Vend with us
          </a>
          <a className="btn btn--ghost" href="#visit">
            Find the park
          </a>
        </div>

        <p className="hero__meta">
          <span>{ADDRESS.street}</span>
          <span>
            {ADDRESS.city}, {ADDRESS.state}
          </span>
          <span>Next up: {NEXT_EVENT.name}</span>
        </p>
      </div>
    </section>
  );
}
