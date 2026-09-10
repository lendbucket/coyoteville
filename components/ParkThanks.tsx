import 'server-only';
import ParkBrand from '@/components/ParkBrand';
import StringLights from '@/components/StringLights';
import ParkingOrgBlock, { parkingLogoUrl } from '@/components/ParkingOrgBlock';
import { currentParkingEvent, getAwardedOrg } from '@/lib/parking';

/**
 * Where Square sends a driver after they pay.
 *
 * Two routes render this: /park/thanks after parking and /park/thanks/gift
 * after a gift. Two static pages rather than one page reading ?gift=1, because
 * a search param read in a server component drops the page out of ISR, and a
 * script that reads the URL on the client would put JavaScript on a page that
 * has none. Square is told which URL to send each kind of payment to, which it
 * has to be told anyway.
 *
 * Nothing on it but the confirmation and who the money went to. No receipt, no
 * next steps, no numbers: Square already emailed them a receipt and there is
 * nowhere else on this site they want to be.
 */
export default async function ParkThanks({ gift = false }: { gift?: boolean }) {
  const event = await currentParkingEvent();
  const org = event ? await getAwardedOrg(event.slug) : null;
  const logo = await parkingLogoUrl(org?.logoPath ?? null);

  return (
    <main className="park" id="main">
      <StringLights tone="dark" variant="top" swags={4} sag={24} bulbsPerSwag={6} id="thanks-lights" />

      <div className="park__shell">
        <ParkBrand />

        <h1 className="park__thanks">Thank you</h1>

        <p className="park__lede">
          {gift
            ? `Thank you for the gift. Every cent of it goes to ${org ? org.name : 'the team'}.`
            : 'You are parked. Show this screen if anybody asks.'}
        </p>

        <ParkingOrgBlock org={org} logo={logo} />
      </div>
    </main>
  );
}
