import 'server-only';
import { MEDIA_BUCKET, signedUrl } from '@/lib/uploads';

/**
 * Who tonight's parking money goes to.
 *
 * Shared by /park and /park/thanks so the two screens cannot drift: a driver
 * who pays sees the same organization named the same way as the screen that
 * persuaded them to.
 *
 * No numbers. There was a live running total here and it is gone: a driver is
 * being asked for ten dollars, not shown a scoreboard, and the counter cost a
 * request every fifteen seconds from every phone in a queue. The organization
 * watches the money on their own page. This says who it helps, and stops.
 *
 * Server rendered with no client component underneath it, which is what makes
 * /park static and free of JavaScript of its own.
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
}: {
  org: { name: string; logoPath: string | null } | null;
  logo: string | null;
}) {
  if (!org) return null;

  return (
    <div className="park__org">
      {logo ? (
        /* Lazy, and below the button. It is the one image on the page and it
           must not sit in front of the thing a driver came here to tap. */
        // eslint-disable-next-line @next/next/no-img-element
        <img className="park__logo" src={logo} alt={org.name} loading="lazy" />
      ) : null}

      <p className="park__share">
        50% of tonight&apos;s parking goes to <b>{org.name}</b>
      </p>
    </div>
  );
}
