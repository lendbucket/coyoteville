/**
 * Photo config.
 *
 * ---------------------------------------------------------------------------
 * HOW TO ADD AN EVENT PHOTO
 * ---------------------------------------------------------------------------
 * 1. Drop the original in public/photos as <name>-<width>.jpg and
 *    <name>-<width>.webp for each width listed in WIDTHS below. Any image
 *    pipeline will do this; sharp one liner:
 *
 *      npx sharp -i shot.jpg -o public/photos/friday-night-960.webp resize 960
 *
 * 2. Add an entry to VENDOR_SPOTLIGHT below with its real width, height and the
 *    widths you generated. Nothing in the layout has to change.
 *
 * This file lives in lib/ rather than public/ on purpose. Anything in public/
 * is served to the world.
 */

/** Widths generated on disk for every photo. Keep this and the files in sync. */
export const WIDTHS = [640, 960, 1280] as const;

export type ResponsivePhoto = {
  /** Basename in /public/photos, with no width suffix and no extension. */
  file: string;
  /** Intrinsic size, used to reserve space so the page does not jump. */
  width: number;
  height: number;
  /** Empty string marks the image as decorative. */
  alt: string;
  /** Widths that actually exist on disk for this photo. */
  widths: readonly number[];
};

const STADIUM_ENDZONE: ResponsivePhoto = {
  file: 'stadium-endzone',
  width: 1500,
  height: 843,
  alt: '',
  widths: WIDTHS,
};

const STADIUM_AERIAL: ResponsivePhoto = {
  file: 'stadium-aerial',
  width: 1500,
  height: 843,
  alt: 'Aerial view of Alice High School and the stadium on North Stadium Road',
  widths: WIDTHS,
};

/** Photos wired into fixed positions in the layout. */
export const SITE_PHOTOS = {
  hero: STADIUM_ENDZONE,
  split: STADIUM_AERIAL,
  stats: { ...STADIUM_ENDZONE, alt: '' },
} as const;

/**
 * Vendor spotlight.
 *
 * Candid photography of the vendors and Alice organizations who set up with us,
 * not logos, so the tiles are full bleed and cropped to fill with no caption.
 * Add one by adding a line here; nothing in the layout needs touching.
 *
 * Alt text describes what is actually in the frame and ends with the place,
 * because that is what a screen reader user and an image search both need.
 *
 * `widths` lists only the variants that exist on disk. A source narrower than
 * 640 gets one variant at its own size rather than being upscaled.
 */
export const VENDOR_SPOTLIGHT: ResponsivePhoto[] = [
  {
    file: 'shaved-ice-truck',
    width: 1170,
    height: 1595,
    widths: [640, 960],
    alt: 'A shaved ice truck lit up at night with its serving window open and string lights overhead, at Coyoteville in Alice, Texas',
  },
  {
    file: 'kettle-corn-booth',
    width: 1080,
    height: 792,
    widths: [640, 960],
    alt: 'Bags of kettle corn lined up on a red Amazing Kettle Corn table under a canopy, at Coyoteville in Alice, Texas',
  },
  {
    file: 'shaved-ice-cups',
    width: 1022,
    height: 1834,
    widths: [640, 960],
    alt: 'A girl holding a tray of red, green and blue shaved ice cups, at Coyoteville in Alice, Texas',
  },
  {
    file: 'grilled-meat-tray',
    width: 433,
    height: 577,
    widths: [433],
    alt: 'A foil tray of grilled meat ready to serve, at Coyoteville in Alice, Texas',
  },
  {
    file: 'vipers-softball',
    width: 960,
    height: 720,
    widths: [640, 960],
    alt: 'A youth softball team in green and white Vipers uniforms together in the dugout, an Alice organization that sets up at Coyoteville in Alice, Texas',
  },
  {
    file: 'youth-group-stage',
    width: 1571,
    height: 640,
    widths: [640, 960, 1280],
    alt: 'A youth group on stage with flags behind them, an Alice organization that sets up at Coyoteville in Alice, Texas',
  },
];
