import Photo from './Photo';
import StringLights from './StringLights';
import { SITE_PHOTOS } from '@/lib/photos';

/**
 * Asymmetric editorial split. The photo column is deliberately wider than the
 * text column, and the photo runs the full height of the row rather than
 * sitting in a padded card.
 */
export default function Split() {
  return (
    <section className="split" aria-labelledby="split-title">
      <div className="split__photo">
        <Photo
          photo={SITE_PHOTOS.split}
          sizes="(max-width: 900px) 100vw, 55vw"
          cover
        />
        <StringLights tone="dark" variant="top" swags={4} sag={30} bulbsPerSwag={6} id="split-lights" />
      </div>

      <div className="split__text">
        <p className="eyebrow">The spot</p>
        <h2 id="split-title">Right between the school and the stadium</h2>
        <p>
          North Stadium Road, in Alice. You already drive past it on the way to every game, every
          graduation and every band night.
        </p>
        <p>
          Park once and walk in. It works because Alice shows up.
        </p>
      </div>
    </section>
  );
}
