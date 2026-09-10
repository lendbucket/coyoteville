import 'server-only';
import ParkingTotal from './ParkingTotal';
import { MEDIA_BUCKET, signedUrl } from '@/lib/uploads';

/**
 * Who tonight's parking money goes to, and how much there is.
 *
 * Shared by /park and /park/thanks so the two screens cannot drift: a driver
 * who pays sees the same organization named the same way, with the same total,
 * as the screen that persuaded them to.
 *
 * Below the button on /park, on purpose. The driver's job is to pay and move.
 * The reason it is worth paying is what they read while the page behind them is
 * still loading.
 */

/**
 * The organization's logo, as a URL a phone can load.
 *
 * The media bucket is private, so this is a signed URL. Twelve hours rather
 * than the ten minute default: the pages are cached for sixty seconds, and a
 * URL that expired while the HTML was still being served would put a broken
 * image on the one page that has to look right to a stranger.
 */
export async function parkingLogoUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  return signedUrl(MEDIA_BUCKET, logoPath, 12 * 60 * 60);
}

export default function ParkingOrgBlock({
  org,
  logo,
  cents,
}: {
  org: { name: string; logoPath: string | null } | null;
  logo: string | null;
  cents: number;
}) {
  return (
    <div className="park__org">
      {logo ? (
        /* Lazy, and below the fold of a phone. It is the one image on the page
           and it must not sit in front of the button on a slow connection.
           eslint-disable-next-line @next/next/no-img-element */
        // eslint-disable-next-line @next/next/no-img-element
        <img className="park__logo" src={logo} alt={org ? org.name : ''} loading="lazy" />
      ) : null}

      {org ? (
        <p className="park__share">
          50% of tonight&apos;s parking goes to <b>{org.name}</b>
        </p>
      ) : null}

      <ParkingTotal initialCents={cents} orgName={org?.name ?? null} />
    </div>
  );
}
