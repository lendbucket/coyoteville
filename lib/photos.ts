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
 * 2. Add an entry to GALLERY. Nothing in the layout has to change. A slot with
 *    `photo: null` renders as a labelled placeholder, so the grid stays intact
 *    while you are still collecting shots.
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

export type GallerySlot = {
  /** Stable key. Also rendered as the slot number on an empty slot. */
  id: string;
  title: string;
  /** What belongs in this slot. Shown while the slot is still empty. */
  note: string;
  /** Fill this in to turn the placeholder into a real photo. */
  photo: ResponsivePhoto | null;
};

/**
 * The gallery grid renders straight off this array. Add, remove or reorder
 * entries and the layout follows. No layout code to touch.
 */
export const GALLERY: GallerySlot[] = [
  {
    id: '01',
    title: 'Trucks at night',
    note: 'Serving windows open, people in line, lights on.',
    photo: null,
  },
  {
    id: '02',
    title: 'The food',
    note: 'Close shots of what the trucks are serving.',
    photo: null,
  },
  {
    id: '03',
    title: 'The crowd',
    note: 'Families eating, kids, people in Coyote gear.',
    photo: null,
  },
  {
    id: '04',
    title: 'The stage',
    note: 'The band playing and people watching.',
    photo: null,
  },
];
