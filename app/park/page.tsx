import type { Metadata } from 'next';
import ParkBrand from '@/components/ParkBrand';
import StringLights from '@/components/StringLights';
import ParkingOrgBlock, { parkingLogoUrl } from '@/components/ParkingOrgBlock';
import {
  DONATION_AMOUNTS,
  PARKING_PRICE_CENTS,
  currentParkingEvent,
  dollars,
  getAwardedOrg,
  getDonationCheckoutUrls,
  getParkingCheckoutUrl,
} from '@/lib/parking';

/**
 * The QR target. A driver, a phone, one bar of signal, a car behind them.
 *
 * Branded, because this is a Coyoteville page and half the people who ever see
 * it will see nothing else of ours. The brand costs almost nothing here: the
 * stylesheet is one file the browser is already fetching, so the mark and one
 * strip of lights are the only additional bytes.
 *
 * Lean is still the rule. One lights instance, no hero photo, nothing below the
 * gift block, and no client JavaScript at all.
 *
 * NO NUMBERS. There is no running total, no counter and no poll. A driver is
 * being asked for ten dollars, not shown a scoreboard, and a page that updates
 * is a page that costs a request every fifteen seconds from every phone in a
 * queue. The organization sees the numbers on their own page; the driver sees
 * who the money helps.
 *
 * It takes no search params, and that is not an oversight. Reading one in Next
 * forces a page out of ISR and into rendering per request, which is the whole
 * cost this page is trying to avoid. The thank you screen is therefore its own
 * route, /park/thanks, prerendered the same way, and Square redirects there.
 *
 * The event is never hardcoded. This URL is printed on a sheet of paper and
 * taped to a post, so it has to be right on every night after this one: it
 * resolves the soonest unfinished event and the organization awarded to it, and
 * shows the parking block with no organization line when nobody has been drawn.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Parking',
  description: 'Parking at Coyoteville, ten dollars a vehicle.',
  /* Not a page for a search result. It is a QR code's destination, and a stale
     copy of it indexed under "Coyoteville parking" helps nobody. */
  robots: { index: false, follow: false },
};

export default async function ParkPage() {
  const event = await currentParkingEvent();

  if (!event) {
    return (
      <main className="park" id="main">
        <StringLights tone="dark" variant="top" swags={4} sag={24} bulbsPerSwag={6} id="park-lights" />
        <div className="park__shell">
          <ParkBrand />
          <h1 className="park__price">Parking</h1>
          <p className="park__lede">
            There is no event on tonight. If you are here for one, find a Coyoteville staff member.
          </p>
        </div>
      </main>
    );
  }

  const [org, checkoutUrl, giftUrls] = await Promise.all([
    getAwardedOrg(event.slug),
    getParkingCheckoutUrl(event.slug),
    getDonationCheckoutUrls(event.slug),
  ]);

  const logo = await parkingLogoUrl(org?.logoPath ?? null);
  const gifts = DONATION_AMOUNTS.filter((amount) => giftUrls[amount]);

  return (
    <main className="park" id="main">
      <StringLights tone="dark" variant="top" swags={4} sag={24} bulbsPerSwag={6} id="park-lights" />

      <div className="park__shell">
        <ParkBrand />

        <h1 className="park__price">Parking {dollars(PARKING_PRICE_CENTS)}</h1>

        {checkoutUrl ? (
          <a className="park__pay" href={checkoutUrl}>
            Pay {dollars(PARKING_PRICE_CENTS)}
          </a>
        ) : (
          /* No link is not a broken page. Cash and the card reader at the gate
             both still work, and saying so is more use than an error. */
          <p className="park__lede park__lede--warn">
            Card payment on your phone is not available right now. Pay at the gate.
          </p>
        )}

        <p className="park__apple">Apple Pay and Google Pay work here.</p>

        <ParkingOrgBlock org={org} logo={logo} />

        {/* The gift block. Below parking, because parking is what they stopped
            for and the gift is the thing they might also do. */}
        {gifts.length ? (
          <div className="park__gift">
            <h2 className="park__gift-head">Add a gift for the team</h2>
            <p className="park__gift-note">
              Every cent of a gift goes to {org ? org.name : 'the team'}. It is not split with
              Coyoteville.
            </p>
            <div className="park__gift-row">
              {gifts.map((amount) => (
                <a className="park__gift-btn" key={amount} href={giftUrls[amount]}>
                  {dollars(amount)}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
