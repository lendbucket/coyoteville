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
        <p className="eyebrow">Where we are</p>
        <h2 id="split-title">Across from the stadium</h2>
        <p>
          The lot is on North Stadium Road, directly across from the stadium and next to Alice
          High School.
        </p>
        <p>Parking opens on the lot at kickoff for $10 per vehicle.</p>
      </div>
    </section>
  );
}
