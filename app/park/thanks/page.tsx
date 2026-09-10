import type { Metadata } from 'next';
import ParkingOrgBlock, { parkingLogoUrl } from '@/components/ParkingOrgBlock';
import { currentParkingEvent, getAwardedOrg, getParkingTotals } from '@/lib/parking';

/**
 * Where Square sends a driver after they pay.
 *
 * Its own route rather than /park with a query string, because reading a search
 * param forces a page out of ISR and this one has to be as instant as the page
 * before it. They are sitting in a car in a queue with the engine running.
 *
 * Nothing on it but the confirmation, who the money went to, and the running
 * total. No receipt, no next steps, no navigation: Square already emailed them
 * a receipt and there is nowhere else on this site they want to be.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Parked',
  robots: { index: false, follow: false },
};

export default async function ParkThanksPage() {
  const event = await currentParkingEvent();

  if (!event) {
    return (
      <main className="park" id="main">
        <div className="park__shell">
          <p className="park__eyebrow">Coyoteville</p>
          <h1 className="park__thanks">Thank you</h1>
          <p className="park__lede">You are parked.</p>
        </div>
      </main>
    );
  }

  const [org, totals] = await Promise.all([
    getAwardedOrg(event.slug),
    getParkingTotals(event.slug),
  ]);

  const logo = await parkingLogoUrl(org?.logoPath ?? null);

  return (
    <main className="park" id="main">
      <div className="park__shell">
        <p className="park__eyebrow">Coyoteville</p>
        <h1 className="park__thanks">Thank you</h1>
        <p className="park__lede">You are parked. Show this screen if anybody asks.</p>

        <ParkingOrgBlock org={org} logo={logo} cents={totals.cents} />
      </div>
    </main>
  );
}
