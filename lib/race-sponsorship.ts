/**
 * The sponsorship levels.
 *
 * No server-only import, because the sponsors page and its form both read
 * these and the price on the page has to be the price Square charges.
 *
 * Every level has a `slots` count, including the ones there is only one of.
 * A level with one slot and a level with three are the same shape to the code
 * and to the page, and writing "Title" as a special case is how a sold title
 * sponsorship ends up still on sale.
 */

export type SponsorLevel = {
  /** Stored in race_sponsors.level. Never rendered. */
  id: string;
  name: string;
  cents: number;
  /** How many of this level exist. */
  slots: number;
  /** What the sponsor actually gets, in the order it matters to them. */
  benefits: string[];
  /** True for the one at the top. Styling only. */
  feature?: boolean;
};

export const SPONSOR_LEVELS: SponsorLevel[] = [
  {
    id: 'title',
    name: 'Title sponsor',
    cents: 150000,
    slots: 1,
    feature: true,
    benefits: [
      'Your logo on the shirt every runner wears home.',
      'Your name and logo on the start line banner.',
      'Named in every post about the race, and in the press release.',
      'Your logo on this page and on the race page, linked to your site.',
      'A booth at both food truck nights at no charge.',
    ],
  },
  {
    id: 'finish-line',
    name: 'Finish line',
    cents: 50000,
    slots: 1,
    benefits: [
      'Your banner at the finish, which is where every photo gets taken.',
      'Named in the finish line announcements.',
      'Your logo on this page and on the race page, linked to your site.',
    ],
  },
  {
    id: 'water-station',
    name: 'Water station',
    cents: 30000,
    slots: 2,
    benefits: [
      'Your banner at a water station, with your people handing out the water if you want.',
      'Named on the course map.',
      'Your logo on this page and on the race page, linked to your site.',
    ],
  },
  {
    id: 'mile-marker',
    name: 'Mile marker',
    cents: 25000,
    slots: 3,
    benefits: [
      'Your name and logo on a mile marker sign on the course.',
      'Your logo on this page and on the race page, linked to your site.',
    ],
  },
  {
    id: 'packet-pickup',
    name: 'Packet pickup',
    cents: 25000,
    slots: 1,
    benefits: [
      'Your banner at packet pickup on the Friday evening.',
      'Something of yours in every runner packet, if you want it there.',
      'Your logo on this page and on the race page, linked to your site.',
    ],
  },
  {
    id: 'kids-fun-run',
    name: 'Kids fun run',
    cents: 25000,
    slots: 1,
    benefits: [
      'Your name on the kids fun run, which is the one the parents photograph.',
      'Your banner at the kids start.',
      'Your logo on this page and on the race page, linked to your site.',
    ],
  },
  {
    id: 'friend',
    name: 'Friend of the race',
    cents: 10000,
    slots: 20,
    benefits: ['Your business name on the sponsor board at the finish.'],
  },
];

export function sponsorLevelById(id: string): SponsorLevel | null {
  return SPONSOR_LEVELS.find((l) => l.id === id) ?? null;
}

/**
 * What is left at each level.
 *
 * A sold out level says sold out and stays on the page. Removing it would make
 * the sheet look thinner than it is and would hide the one fact that makes
 * somebody move on the next level down: that the good ones go.
 */
export type LevelAvailability = {
  level: SponsorLevel;
  taken: number;
  remaining: number;
  soldOut: boolean;
};

export function availabilityFor(
  levels: SponsorLevel[],
  takenByLevel: Record<string, number>
): LevelAvailability[] {
  return levels.map((level) => {
    const taken = Math.max(0, takenByLevel[level.id] ?? 0);
    const remaining = Math.max(0, level.slots - taken);
    return { level, taken, remaining, soldOut: remaining === 0 };
  });
}

/** The two numbers Robert watches. Committed is everything, collected is paid. */
export type SponsorTotals = { committedCents: number; collectedCents: number; count: number };
