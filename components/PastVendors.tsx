import { PAST_VENDORS } from '@/lib/seo';

export default function PastVendors() {
  return (
    <section className="section section--char" aria-labelledby="past-title">
      <div className="shell">
        <p className="eyebrow">Past vendors</p>
        <h2 id="past-title">Who has set up here</h2>
        <p className="lede">
          These vendors have set up at Coyoteville. Several of them come back every event.
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
