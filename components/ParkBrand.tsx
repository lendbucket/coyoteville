import { SITE } from '@/lib/seo';

/**
 * The Coyoteville mark, for /park only.
 *
 * The site's Brand component loads /logo.svg, which is 115 kB raw and 42 kB
 * brotli. That is fine on the homepage, where it is the brand and the visitor
 * is browsing. It is not fine here: /park is opened from a QR code by somebody
 * on one bar of signal with a car behind them, who has never visited this site
 * and has nothing cached.
 *
 * So this is the cropped emblem at 10.8 kB, with the name set in the display
 * face beside it. The wordmark costs nothing at all: Anton is already preloaded
 * site wide, so the type is bytes the browser has fetched anyway.
 *
 * Net saving on the page a driver actually loads: about 31 kB compressed, for a
 * mark that is larger and easier to recognise through a windscreen than the
 * lockup it replaces.
 */
export default function ParkBrand() {
  return (
    <div className="parkbrand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="parkbrand__mark"
        src="/mark-192.png"
        alt=""
        width={64}
        height={64}
        loading="eager"
        decoding="sync"
      />
      <span className="parkbrand__name">{SITE.name}</span>
    </div>
  );
}
