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

import { isSettled, isAbandonedCheckout, RELEASED_APPROVAL_STATUSES } from './holds-spot';

/** The columns the summary needs. A subset of the application row. */
export type RevenueRow = {
  /** Named on the outstanding list, because "1 unpaid" is not actionable. */
  business_name?: string | null;
  spot_type: string;
  amount_cents: number;
  payment_status: string;
  payment_method: string | null;
  approval_status: string;
  square_order_id: string | null;
  /**
   * Set once Square actually charged. An order with no payment against it is a
   * checkout somebody started and walked away from, which is the difference
   * between money that is coming and a row standing on a spot.
   */
  square_payment_id?: string | null;
  created_at: string;
  /**
   * Cash actually counted against an offline row, recorded by hand in the
   * tracker. Null means nobody has reconciled it yet, which is not the same as
   * zero: zero is "we counted and got nothing".
   */
  amount_received_cents?: number | null;
  /**
   * 'event', 'day' or 'monthly'. Absent on a row read by an older caller, which
   * is why it is optional: nothing in this file needs it, and it rides along
   * only so the tracker can tell a monthly application waiting on review apart
   * from an abandoned checkout.
   */
  booking_kind?: string;
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
  /**
   * Money in hand, broken out by spot type.
   *
   * Settled rows only, and an offline row counts what has actually been
   * counted against it rather than what it claims. Nothing unpaid is ever in
   * here. That sounds obvious and it was not true of the strip that shipped:
   * the headline was booked money, so a prepaid row nobody had collected from
   * raised the total the moment the form was submitted.
   */
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
  /**
   * Approved and unpaid. Money that is owed by somebody who has a spot.
   *
   * This used to be every unpaid row carrying a Square order, which is the
   * definition of an abandoned checkout, not of a debt. Five people who closed
   * a tab were reported as outstanding revenue while the one vendor who
   * genuinely owes for a spot she was given sat in the same number,
   * indistinguishable.
   */
  outstanding: RevenueLine;
  /** Who owes it. Same rows as outstanding, in the order they applied. */
  outstandingRows: { name: string; cents: number }[];
  /**
   * Unpaid, Square made an order, no payment ever arrived. Counted in neither
   * collected nor outstanding: nobody is coming and nobody owes anything. Shown
   * so the rows are accounted for rather than silently missing.
   */
  abandoned: RevenueLine;
  /**
   * What was sold against what is actually in hand.
   *
   * These are two different questions and the strip used to answer only the
   * first. A prepaid row is stamped paid by the database the instant the vendor
   * submits the form, before anyone has collected anything, so booked money and
   * held money are not the same number and the difference is the thing worth
   * seeing.
   */
  cash: CashReconciliation;
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
 * Rows that are still part of the event's money.
 *
 * Denied and cancelled are both out. A denied row was refunded, so its money
 * went back; a cancelled row is a checkout nobody finished. This used to
 * exclude cancelled alone, on the reasoning that a denial is visible elsewhere,
 * which left a refunded spot sitting in the collected total.
 */
function live(row: RevenueRow): boolean {
  return !(RELEASED_APPROVAL_STATUSES as readonly string[]).includes(row.approval_status);
}

/**
 * What this row is actually worth, in hand.
 *
 * An online row cleared through Square, so its fee is money. An offline row is
 * worth what somebody has counted against it and nothing until they do,
 * however confidently the column says paid.
 */
function cashOf(row: RevenueRow): number {
  if (row.payment_method === 'offline') return Math.max(0, row.amount_received_cents ?? 0);
  return Math.max(0, row.amount_cents);
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

export type CashReconciliation = {
  /** Sum of amount_cents on settled rows. What was sold. */
  bookedCents: number;
  /**
   * What is actually held, and the same number as collected.cents. Kept as its
   * own field because the pair is the point: booked against received is where
   * an unreconciled prepaid row shows up as a difference.
   */
  receivedCents: number;
  /**
   * Booked minus received. Positive is money owed; negative is an overpayment,
   * which is why it is not floored at zero. Both are recordable and both are
   * worth seeing.
   */
  differenceCents: number;
  /**
   * Settled offline rows with nothing recorded against them at all. These are
   * the rows claiming paid on the strength of a database default. The cents
   * figure is what they are booked at, which is what is unaccounted for.
   */
  unreconciled: RevenueLine;
};

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
export function summariseRevenue(
  rows: RevenueRow[],
  capacities: Capacities,
  now: number = Date.now()
): RevenueSummary {
  const truck = emptyLine();
  const booth = emptyLine();
  const free = emptyLine();
  const square = emptyLine();
  const prepaid = emptyLine();
  const outstanding = emptyLine();
  const abandoned = emptyLine();
  const unreconciled = emptyLine();
  const outstandingRows: { name: string; cents: number }[] = [];

  let bookedCents = 0;
  let collectedCents = 0;

  for (const row of rows) {
    if (!live(row)) continue;

    const amount = Math.max(0, row.amount_cents);

    if (isSettled(row.payment_status)) {
      const cash = cashOf(row);
      bookedCents += amount;
      collectedCents += cash;

      /* The per type lines carry cash, not the booked fee, so they add up to
         the headline exactly. A prepaid row nobody has collected from shows in
         the count and contributes nothing to the dollars, which is the truth
         about it. */
      const line = row.spot_type === 'truck' ? truck : row.spot_type === 'booth' ? booth : free;
      line.count += 1;
      line.cents += cash;

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

      /* Claims paid with nothing counted against it. The cents figure is what
         it is booked at, which is what is unaccounted for. */
      if (
        row.payment_method === 'offline' &&
        (row.amount_received_cents === null || row.amount_received_cents === undefined)
      ) {
        unreconciled.count += 1;
        unreconciled.cents += amount;
      }
      continue;
    }

    /* Unpaid from here down, and none of it is ever collected money.
     *
     * A vendor who walked away from a checkout owes nothing: there is no spot
     * held and nobody to chase. A vendor who was approved and has not paid does
     * owe, and is named, because a bare count of one is not something you can
     * act on. Everything else, an unpaid application still waiting on review,
     * is neither: it is a queue item, not a debt. */
    if (row.payment_status !== 'unpaid' || amount <= 0) continue;

    if (isAbandonedCheckout({ ...row, square_payment_id: row.square_payment_id ?? null }, now)) {
      abandoned.count += 1;
      abandoned.cents += amount;
      continue;
    }

    if (row.approval_status === 'approved') {
      outstanding.count += 1;
      outstanding.cents += amount;
      outstandingRows.push({ name: row.business_name || 'Unnamed vendor', cents: amount });
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
    outstandingRows,
    abandoned,
    cash: {
      bookedCents,
      receivedCents: collectedCents,
      differenceCents: bookedCents - collectedCents,
      unreconciled,
    },
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
