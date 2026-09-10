import 'server-only';

/**
 * Where every vendor stands on September 11.
 *
 * Robert's lot plan, as data. Held in code rather than typed into the tracker
 * one row at a time, because a lot plan is decided once on paper and then has
 * to reach thirty rows without a transcription error: a vendor sent to the
 * wrong space on the night is an argument in a gravel lot while cars queue.
 *
 * The number carries its own noun. "Truck 2" and "Booth 2" are different
 * places, and a bare 2 in a column called spot_number is ambiguous the moment
 * somebody reads it without knowing which list it came from. That is why the
 * value written to the database is the whole label.
 *
 * Matching is on business_name, case insensitive and trimmed, and nothing else.
 * A name that does not match exactly is reported back rather than guessed at:
 * "Heathers cookie Shop" and "Heather's Cookie Shop" are the same stall and two
 * different strings, and a fuzzy match that silently picked one would be a
 * wrong spot number nobody noticed until the night.
 */

export const SPOT_EVENT_SLUG = 'home-game-2026-09-11';

/** The lot map Robert drops in before sending. Attached to every email. */
export const LOT_MAP_PATH = 'public/photos/lot-map-2026-09-11.png';
export const LOT_MAP_FILENAME = 'coyoteville-lot-map-september-11.png';

export type SpotAssignment = { name: string; spot: string };

function label(kind: string, list: string[]): SpotAssignment[] {
  return list.map((name, i) => ({ name, spot: `${kind} ${i + 1}` }));
}

export const SPOT_ASSIGNMENTS: SpotAssignment[] = [
  ...label('Truck', [
    'Matas Papas',
    'MuddyWaterz',
    'Redefined Caterers',
    'Hawaiian Ice',
    '361 Treats',
  ]),
  /* Tents continue the truck numbering rather than starting again, because
     they are the same row of the lot and the paper plan numbers them 6 and 7.
     Their label still says Tent, so nobody is sent to Truck 6. */
  { name: 'C & B Chicharrones', spot: 'Tent 6' },
  { name: 'El Charo Mini Tacos', spot: 'Tent 7' },
  ...label('Booth', [
    'Bargain for Less',
    'Cakes by Renee',
    'Cold Sips',
    "Sassy's slime & more",
    'FOCVSED Barber Studio',
    'Mi Linda Cookies and Loaves',
    'Noodles 3D Doodles',
    "Odom's Corn Nuts",
    'Coronado Jerky',
    'Sweet Street',
    "The Slime Bar by Treat Yo' Self",
    'Heathers cookie Shop',
    'Jasmine Bueno',
    'Hairos Toys and More',
  ]),
  ...label('Org', ['Alice Storm', 'STX Souljas', 'Boys and Girls Club', 'Velocity Vipers']),
];

/** How a name is compared. Trimmed, folded, and whitespace collapsed. */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const ASSIGNMENT_COUNT = SPOT_ASSIGNMENTS.length;
