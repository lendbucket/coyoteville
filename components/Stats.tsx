import Photo from './Photo';
import { SITE_PHOTOS } from '@/lib/photos';
import { NEXT_EVENT, PRICING } from '@/lib/seo';

/**
 * Stats strip laid over a photograph rather than a flat colour block. The
 * numbers come from lib/seo so the strip and the Event schema cannot disagree.
 */
export default function Stats() {
  const stats = [
    { value: NEXT_EVENT.displayTime.replace(/:00\s*/, ''), label: 'Gates open Friday' },
    { value: PRICING.booth.price, label: PRICING.booth.label },
    { value: PRICING.truck.price, label: PRICING.truck.label },
    { value: 'Free', label: 'Coyote groups and nonprofits' },
  ];

  return (
    <section className="stats" aria-label="At a glance">
      <div className="stats__bg" aria-hidden="true">
        <Photo photo={SITE_PHOTOS.stats} sizes="100vw" cover />
      </div>

      <div className="stats__inner">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <b className="stat__value">{s.value}</b>
            <span className="stat__label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
