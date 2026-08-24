import Photo from './Photo';
import StringLights from './StringLights';
import { VENDOR_SPOTLIGHT } from '@/lib/photos';

/**
 * Vendor spotlight.
 *
 * The photographs carry the section, so the tiles are full bleed with nothing
 * around them and no caption over them. Every tile is the same square so rows
 * cannot go ragged with a mix of portrait, landscape and panorama sources.
 */
export default function VendorSpotlight() {
  if (VENDOR_SPOTLIGHT.length === 0) return null;

  return (
    <section className="spotlight" id="spotlight" aria-labelledby="spotlight-title">
      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={7} id="spotlight-lights" />

      <div className="shell spotlight__head">
        <h2 id="spotlight-title">Some of our vendors and orgs</h2>
        <p>
          These are the local businesses and Alice organizations that set up with us.
        </p>
      </div>

      <ul className="spotlight__grid">
        {VENDOR_SPOTLIGHT.map((photo) => (
          <li className="spotlight__cell" key={photo.file}>
            <Photo
              photo={photo}
              sizes="(max-width: 640px) 50vw, (max-width: 980px) 33vw, 25vw"
              cover
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
