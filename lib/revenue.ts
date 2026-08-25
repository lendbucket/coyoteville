/**
 * Revenue summary for one event.
 *
 * Pure functions over rows that have already been read. Nothing here touches
 * the database, so the page and the CSV export share one set of numbers and
 * there is no second query to drift.
 *
 * The rule that runs through the whole file: every dollar figure comes from
 * amount_cents on the rows. No price is ever read from the PRICING constants,
 * including the projection, which derives the going rate for a spot type from
 * what vendors are actually being charged. Change a fee and these numbers
 * follow it without anyone editing this file.
 */

/** The columns the summary needs. A subset of the application row. */
export type RevenueRow = {
  spot_type: string;
  amount_cents: number;
  payment_status: string;
  payment_method: string | null;
  approval_status: string;
  square_order_id: string | null;
  created_at: string;
};

export type RevenueLine = {
  count: number;
  cents: number;
};

export type ProjectedLine = {
  /** Null when the event row carries no capacity for this type. */
  capacity: number | null;
  /** Derived from the rows. Null when no row of this type has ever carried a fee. */
  rateCents: number | null;
  /** capacity times rate. Null when either input is unknown. */
  cents: number | null;
};

export type RevenueSummary = {
  /** Settled money, broken out by spot type. */
  collected: {
    cents: number;
    truck: RevenueLine;
    booth: RevenueLine;
    free: RevenueLine;
  };
  /**
   * The same settled money, split by how it arrived. Only rows carrying a fee
   * are counted, so the two lines always add up to collected.cents.
   */
  bySource: {
    square: RevenueLine;
    prepaid: RevenueLine;
  };
  /** Unpaid rows that have a Square order sitting against them. */
  outstanding: RevenueLine;
  projected: {
    truck: ProjectedLine;
    booth: ProjectedLine;
    /** Null when neither type can be projected. */
    cents: number | null;
    /**
     * Projected minus collected, floored at zero. Null unless both sides
     * projected: collected counts every spot type, so measuring it against
     * half a lot's capacity would report a gap that is smaller than the truth,
     * or zero, and neither is worth putting on the page.
     */
    gapCents: number | null;
    /** False when a capacity or a rate was missing, so the total is partial. */
    complete: boolean;
  };
};

/**
 * Payment states that mean the money is settled.
 *
 * 'paid' is a Square payment that cleared or a prepaid row booked through the
 * hidden link. 'not_required' is a free Alice organisation spot, confirmed the
 * moment it is submitted. Both are counted so the free spots show a real count
 * against their zero dollars; they carry amount_cents 0, so including them
 * cannot move a dollar figure. This is the same pair lib/spots.ts treats as
 * claimed, and the same pair the tracker already labels "Paid or free".
 */
const SETTLED = new Set(['paid', 'not_required']);

/** Cancelled rows are money that went away, so nothing counts them. */
function live(row: RevenueRow): boolean {
  return row.approval_status !== 'cancelled';
}

function emptyLine(): RevenueLine {
  return { count: 0, cents: 0 };
}

/**
 * What a spot of this type currently costs, read off the rows.
 *
 * The most common fee among live rows of that type wins, with the most recent
 * application breaking a tie. Unpaid rows are included on purpose: a row that
 * was created an hour ago carries today's fee whether or not it has been paid,
 * which makes it the best evidence of the current price. Zero amounts are
 * skipped so a comped spot cannot drag the rate down.
 *
 * Returns null when no row of that type has ever carried a fee, in which case
 * that half of the projection is reported as unknown rather than guessed.
 */
function deriveRate(rows: RevenueRow[], spotType: string): number | null {
  const seen = new Map<number, { count: number; latest: number }>();

  for (const row of rows) {
    if (row.spot_type !== spotType || !live(row) || row.amount_cents <= 0) continue;

    const at = Date.parse(row.created_at);
    const entry = seen.get(row.amount_cents);

    if (entry) {
      entry.count += 1;
      if (!Number.isNaN(at) && at > entry.latest) entry.latest = at;
    } else {
      seen.set(row.amount_cents, { count: 1, latest: Number.isNaN(at) ? 0 : at });
    }
  }

  let best: number | null = null;
  let bestEntry = { count: 0, latest: 0 };

  for (const [cents, entry] of seen) {
    const wins =
      best === null ||
      entry.count > bestEntry.count ||
      (entry.count === bestEntry.count && entry.latest > bestEntry.latest);

    if (wins) {
      best = cents;
      bestEntry = entry;
    }
  }

  return best;
}

function project(
  rows: RevenueRow[],
  spotType: string,
  capacity: number | null
): ProjectedLine {
  const rateCents = deriveRate(rows, spotType);
  return {
    capacity,
    rateCents,
    cents: capacity === null || rateCents === null ? null : capacity * rateCents,
  };
}

export type Capacities = {
  truck: number | null;
  booth: number | null;
};

/**
 * Build the summary.
 *
 * `rows` must be every application for the event, not a filtered slice, so the
 * figures stay meaningful while the tracker is being searched. Capacities come
 * from the event row via lib/spots.ts.
 */
export function summariseRevenue(rows: RevenueRow[], capacities: Capacities): RevenueSummary {
  const truck = emptyLine();
  const booth = emptyLine();
  const free = emptyLine();
  const square = emptyLine();
  const prepaid = emptyLine();
  const outstanding = emptyLine();

  let collectedCents = 0;

  for (const row of rows) {
    if (!live(row)) continue;

    const amount = Math.max(0, row.amount_cents);

    if (SETTLED.has(row.payment_status)) {
      collectedCents += amount;

      const line = row.spot_type === 'truck' ? truck : row.spot_type === 'booth' ? booth : free;
      line.count += 1;
      line.cents += amount;

      /* How it was collected.
       *
       * Only rows carrying a fee are split, so the two lines add up to the
       * collected total exactly. That also keeps the free spots out of it:
       * they are stamped payment_method 'online' at submission even though
       * Square is never called for them, and counting them as Square traffic
       * would overstate how many vendors actually checked out. */
      if (amount > 0) {
        const bucket = row.payment_method === 'offline' ? prepaid : square;
        bucket.count += 1;
        bucket.cents += amount;
      }
      continue;
    }

    // Money that is sitting there. A Square order exists, so the vendor was
    // sent to checkout and never finished. This is the same test the abandoned
    // list uses to decide a row is chaseable.
    if (row.payment_status === 'unpaid' && row.square_order_id) {
      outstanding.count += 1;
      outstanding.cents += amount;
    }
  }

  const projectedTruck = project(rows, 'truck', capacities.truck);
  const projectedBooth = project(rows, 'booth', capacities.booth);

  const parts = [projectedTruck.cents, projectedBooth.cents].filter(
    (c): c is number => c !== null
  );

  const projectedCents = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  const complete = projectedTruck.cents !== null && projectedBooth.cents !== null;

  return {
    collected: { cents: collectedCents, truck, booth, free },
    bySource: { square, prepaid },
    outstanding,
    projected: {
      truck: projectedTruck,
      booth: projectedBooth,
      cents: projectedCents,
      // A full lot cannot owe less than nothing. Overselling a type against a
      // stale capacity would otherwise show a negative gap.
      gapCents:
        projectedCents === null || !complete
          ? null
          : Math.max(0, projectedCents - collectedCents),
      complete,
    },
  };
}

/** "$1,250" for the page and the CSV. Whole dollars: no fee here has cents. */
export function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** "1250.00" for a CSV cell, so a spreadsheet reads it as a number. */
export function dollarsRaw(cents: number): string {
  return (cents / 100).toFixed(2);
}
