import type { Metadata } from 'next';
import {
  PARKING_PRICE_CENTS,
  currentParkingEvent,
  dollars,
  getAwardedOrg,
  getParkingCheckoutUrl,
  getParkingTotals,
} from '@/lib/parking';
import ParkingOrgBlock, { parkingLogoUrl } from '@/components/ParkingOrgBlock';

/**
 * The QR target. A driver, a phone, one bar of signal, a car behind them.
 *
 * Every decision on this page comes from that sentence. ISR rather than dynamic
 * so the HTML is already sitting on the edge when the QR is scanned. No string
 * lights, no hero image, no third party anything, and exactly one client
 * component, which does nothing but refresh a number. The two brand faces are
 * already preloaded site wide and nothing else is loaded.
 *
 * Sixty seconds of staleness costs a slightly old running total and buys a page
 * that does not touch the database or Square on the way to a driver's screen.
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
        <div className="park__shell">
          <p className="park__eyebrow">Coyoteville</p>
          <h1 className="park__price">Parking</h1>
          <p className="park__lede">
            There is no event on tonight. If you are here for one, find a Coyoteville staff member.
          </p>
        </div>
      </main>
    );
  }

  const [org, totals, checkoutUrl] = await Promise.all([
    getAwardedOrg(event.slug),
    getParkingTotals(event.slug),
    getParkingCheckoutUrl(event.slug),
  ]);

  const logo = await parkingLogoUrl(org?.logoPath ?? null);

  return (
    <main className="park" id="main">
      <div className="park__shell">
        <p className="park__eyebrow">Coyoteville</p>
        <h1 className="park__price">Parking {dollars(PARKING_PRICE_CENTS)}</h1>

        {checkoutUrl ? (
          <a className="park__pay" href={checkoutUrl}>
            Pay {dollars(PARKING_PRICE_CENTS)}
          </a>
        ) : (
          /* No link is not a broken page. Cash and the card reader at the gate
             both still work, and saying so is more use than an error. */
          <p className="park__lede park__lede--warn">
            Card payment on your phone is not available right now. Pay at the gate, cash or card.
          </p>
        )}

        <p className="park__apple">Apple Pay and Google Pay work here.</p>

        <ParkingOrgBlock org={org} logo={logo} cents={totals.cents} />
      </div>
    </main>
  );
}
