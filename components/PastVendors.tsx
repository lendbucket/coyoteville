import { PAST_VENDORS } from '@/lib/seo';

export default function PastVendors() {
  return (
    <section className="section section--char" aria-labelledby="past-title">
      <div className="shell">
        <p className="eyebrow">Who has been out here</p>
        <h2 id="past-title">Trucks and booths that set up with us</h2>
        <p className="lede">
          These folks have worked our lot. Some of them every time. Go find them and give them
          your business.
        </p>

        <ul className="chips">
          {PAST_VENDORS.map((vendor) => (
            <li className="chip" key={vendor}>
              {vendor}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
