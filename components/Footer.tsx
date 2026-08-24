import Brand from './Brand';
import StringLights from './StringLights';
import { ADDRESS, PRICING, SITE } from '@/lib/seo';
import { supportEmail } from '@/lib/support';

export default function Footer() {
  const year = 2026;
  const email = supportEmail();

  return (
    <footer className="footer">
      <StringLights tone="dark" variant="top" swags={7} sag={26} bulbsPerSwag={6} id="footer-lights" />

      <div className="shell footer__grid">
        <div>
          <div className="footer__brand">
            <Brand size={144} eager={false} />
          </div>
          <p style={{ maxWidth: '34ch' }}>
            Outdoor food truck park at {ADDRESS.street} in {ADDRESS.city}, {ADDRESS.state}. We
            open at 4:00 PM before home games. Admission is free.
          </p>
        </div>

        <div>
          <h3>The park</h3>
          <ul>
            <li>
              <a href="#about">About</a>
            </li>
            <li>
              <a href="#vendors">Vendor spots</a>
            </li>
            <li>
              <a href="#apply">Apply to vend</a>
            </li>
            <li>
              <a href="#faq">FAQ</a>
            </li>
            <li>
              <a href="#visit">Visit</a>
            </li>
          </ul>
        </div>

        <div>
          <h3>Get in touch</h3>
          <ul>
            <li>
              <a href={`mailto:${email}`}>{email}</a>
            </li>
            <li>
              <a href={SITE.facebook} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
            </li>
            <li>{ADDRESS.street}</li>
            <li>
              {ADDRESS.city}, {ADDRESS.state} {ADDRESS.zip}
            </li>
          </ul>
        </div>
      </div>

      <div className="shell footer__bottom">
        <span>
          Copyright {year} {SITE.name}. All rights reserved.
        </span>
        <span>
          Booths {PRICING.booth.price} per event. Truck spots {PRICING.truck.price}. Alice
          organizations set up free.
        </span>
      </div>
    </footer>
  );
}
