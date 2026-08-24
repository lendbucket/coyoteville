import Photo from './Photo';
import StringLights from './StringLights';
import { GALLERY } from '@/lib/photos';

/**
 * Photo grid rendered straight off the GALLERY array in lib/photos. Adding an
 * event photo is a config edit, not a layout edit. A slot with no photo yet
 * renders as a labelled placeholder so the grid keeps its shape.
 */
export default function Gallery() {
  if (GALLERY.length === 0) return null;

  return (
    <section className="gallery" id="gallery" aria-labelledby="gallery-title">
      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={7} id="gallery-lights" />

      <div className="shell">
        <p className="eyebrow">From the lot</p>
        <h2 id="gallery-title">These slots get filled Friday night</h2>

        <ul className="gallery__grid">
          {GALLERY.map((slot) => (
            <li className="gallery__cell" key={slot.id}>
              {slot.photo ? (
                <figure className="gallery__figure">
                  <Photo
                    photo={slot.photo}
                    sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 25vw"
                    cover
                  />
                  <figcaption className="gallery__caption">{slot.title}</figcaption>
                </figure>
              ) : (
                <div className="gallery__empty">
                  <span className="gallery__num">{slot.id}</span>
                  <span className="gallery__title">{slot.title}</span>
                  <span className="gallery__note">{slot.note}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
