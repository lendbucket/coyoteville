import 'server-only';
import { SITE, SITE_URL } from './seo';
import { getEvents } from './events-source';
import { getParkingLedger, getParkingTotals, type ParkingRow } from './parking';
import { emptyWaivers, getWaiversForEvents } from './volunteer-waivers';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { HEALTHCHECK_BUSINESS_NAME } from './healthcheck';
import { LIVE_PURPOSE, documentToken } from './doc-token';

/**
 * What the night actually did, gathered in one place.
 *
 * Two callers, one builder: the cron that fires after the lot closes, and the
 * button in the tracker for the night the cron does not fire. They must not be
 * able to disagree, which is the whole reason this is a function and not two
 * routes that each assemble their own numbers.
 *
 * Everything here reads. Nothing in this file writes a row, sends anything, or
 * can be reached from the payment path.
 */

export type ReportBucket = { label: string; payments: number; cents: number };

export type EventReport = {
  event: {
    slug: string;
    name: string;
    displayDate: string;
    startsAtISO: string;
    endsAtISO: string;
  };
  org: { id: string; name: string } | null;
  money: {
    collectedCents: number;
    vehicles: number;
    donationCents: number;
    donations: number;
    /** The flat 3.25% the terms name, which is what the payout is computed on. */
    flatFeeCents: number;
    netCents: number;
    shareCents: number;
    owedCents: number;
    /** What Square actually charged, summed from the rows that have settled. */
    actualFeeCents: number;
    actualFeesPending: number;
    payByISO: string;
  };
  timeline: ReportBucket[];
  vendors: {
    approved: number;
    paid: number;
    unpaid: { name: string; contact: string }[];
    withSpot: number;
    missingSpot: { name: string }[];
    pending: { name: string; contact: string }[];
  };
  volunteers: {
    signed: number;
    adults: number;
    minors: number;
    minimum: number;
    meetsMinimum: boolean;
  };
  /** Things worth a second look. Empty is the good case and says so. */
  flags: string[];
  links: { tracker: string; live: string | null };
  /** Every row for the event, for the attachment. */
  rows: ParkingRow[];
};

const MINUTES_PER_BUCKET = 30;

function centralTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Payments by half hour, across the window the event actually ran.
 *
 * Buckets are built from starts_at rather than from the first payment, so an
 * empty first hour shows as an empty first hour instead of vanishing. Anything
 * outside the window still counts in the totals and simply has no bucket: the
 * timeline answers "when was the lot busiest", not "where is all the money".
 */
function buildTimeline(rows: ParkingRow[], startsAt: number, endsAt: number): ReportBucket[] {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return [];

  const size = MINUTES_PER_BUCKET * 60 * 1000;
  const count = Math.min(48, Math.ceil((endsAt - startsAt) / size));

  const buckets: ReportBucket[] = Array.from({ length: count }, (_, i) => ({
    label: centralTime(new Date(startsAt + i * size).toISOString()),
    payments: 0,
    cents: 0,
  }));

  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at)) continue;
    const index = Math.floor((at - startsAt) / size);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].payments += 1;
    buckets[index].cents += Math.max(0, row.amount_cents ?? 0);
  }

  return buckets;
}

type VendorRow = {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  approval_status: string | null;
  payment_status: string | null;
  spot_number: string | null;
  amount_cents: number | null;
};

/**
 * Anything that does not look right, in plain sentences.
 *
 * Every one of these is a thing that has actually gone wrong at least once, or
 * would be invisible until it mattered. An empty list is a real answer and the
 * report says so rather than leaving a blank heading.
 */
function findFlags(rows: ParkingRow[], vendors: VendorRow[], now: number): string[] {
  const flags: string[] = [];

  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const stale = rows.filter((r) => {
    if (r.square_fee_cents !== null && r.square_fee_cents !== undefined) return false;
    const at = Date.parse(r.created_at);
    return Number.isFinite(at) && now - at > TWO_HOURS;
  });

  if (stale.length) {
    flags.push(
      `${stale.length} ${stale.length === 1 ? 'payment has' : 'payments have'} no Square fee ` +
        'more than two hours after it landed. Square usually settles within the hour, so these ' +
        'are worth checking in the Square dashboard.'
    );
  }

  const manyCars = rows.filter((r) => (r.vehicle_count ?? 0) > 1);
  if (manyCars.length) {
    flags.push(
      `${manyCars.length} ${manyCars.length === 1 ? 'row counts' : 'rows count'} more than one ` +
        'vehicle. The QR path books one car per payment, so these came from somewhere else.'
    );
  }

  const byEmail = new Map<string, string[]>();
  for (const v of vendors) {
    const email = (v.email ?? '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, [...(byEmail.get(email) ?? []), v.business_name ?? 'unnamed']);
  }
  for (const [email, names] of byEmail) {
    if (names.length > 1) {
      flags.push(`${email} has ${names.length} applications: ${names.join(', ')}.`);
    }
  }

  return flags;
}

/**
 * The report for one event.
 *
 * Returns null only when the event does not exist. A night with no payments is
 * a real report with zeroes in it, and is exactly the report worth reading.
 */
export async function buildEventReport(
  eventSlug: string,
  now: number = Date.now()
): Promise<EventReport | null> {
  const events = await getEvents();
  const event = events.find((e) => e.slug === eventSlug);
  if (!event) return null;

  const [totals, rows, waiverMap] = await Promise.all([
    getParkingTotals(eventSlug),
    getParkingLedger(eventSlug, 2000),
    getWaiversForEvents([eventSlug]),
  ]);

  /* The award and the vendors, read here rather than through the admin view,
     which is scoped and filtered for a screen. */
  let org: { id: string; name: string } | null = null;
  let vendors: VendorRow[] = [];

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();

    const { data: award } = await supabase
      .from('org_event_awards')
      .select('org_application_id')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    const orgId = (award as { org_application_id: string | null } | null)?.org_application_id;
    if (orgId) {
      const { data: row } = await supabase
        .from('org_applications')
        .select('id, org_name')
        .eq('id', orgId)
        .maybeSingle();
      const o = row as { id: string; org_name: string } | null;
      if (o) org = { id: o.id, name: o.org_name };
    }

    const { data: applications } = await supabase
      .from('vendor_applications')
      .select(
        'id, business_name, contact_name, email, approval_status, payment_status, spot_number, amount_cents'
      )
      .eq('event_slug', eventSlug)
      /* The health check writes real rows through the real signup route. A
         report that counted them would tell Robert a vendor he has never heard
         of owes money. */
      .neq('business_name', HEALTHCHECK_BUSINESS_NAME);

    vendors = (applications ?? []) as unknown as VendorRow[];
  }

  const approved = vendors.filter((v) => v.approval_status === 'approved');
  const pending = vendors.filter((v) => v.approval_status === 'pending');

  const contact = (v: VendorRow) =>
    [v.contact_name, v.email].filter(Boolean).join(', ') || 'no contact on the row';

  /* The minimum comes off the waiver summary rather than a constant here, so
     the report and the tracker cannot name two different numbers. */
  const waivers = waiverMap[eventSlug] ?? emptyWaivers(eventSlug);
  const adults = waivers.adults.length;
  const minors = waivers.minors.length;

  const startsAt = Date.parse(event.startISO);
  const endsAt = Date.parse(event.endISO);

  const token = documentToken(LIVE_PURPOSE, org?.id ?? '');

  return {
    event: {
      slug: event.slug,
      name: event.name,
      displayDate: event.displayDate,
      startsAtISO: event.startISO,
      endsAtISO: event.endISO,
    },
    org,
    money: {
      collectedCents: totals.cents,
      vehicles: totals.vehicles,
      donationCents: totals.donationCents,
      donations: totals.donations,
      flatFeeCents: totals.feeCents,
      netCents: Math.max(0, totals.cents - totals.feeCents),
      shareCents: totals.shareCents,
      owedCents: totals.owedCents,
      actualFeeCents: totals.actualFeeCents,
      actualFeesPending: totals.actualFeesPending,
      payByISO: new Date(endsAt + 7 * 86400000).toISOString(),
    },
    timeline: buildTimeline(rows, startsAt, endsAt),
    vendors: {
      approved: approved.length,
      paid: approved.filter((v) => v.payment_status === 'paid' || (v.amount_cents ?? 0) === 0)
        .length,
      unpaid: approved
        .filter((v) => v.payment_status !== 'paid' && (v.amount_cents ?? 0) > 0)
        .map((v) => ({ name: v.business_name ?? 'unnamed', contact: contact(v) })),
      withSpot: approved.filter((v) => (v.spot_number ?? '').trim()).length,
      missingSpot: approved
        .filter((v) => !(v.spot_number ?? '').trim())
        .map((v) => ({ name: v.business_name ?? 'unnamed' })),
      pending: pending.map((v) => ({ name: v.business_name ?? 'unnamed', contact: contact(v) })),
    },
    volunteers: {
      signed: adults + minors,
      adults,
      minors,
      minimum: waivers.minimum,
      meetsMinimum: waivers.met,
    },
    flags: findFlags(rows, vendors, now),
    links: {
      tracker: `${SITE_URL}/admin`,
      live: org && token ? `${SITE_URL}/fundraiser/live?id=${org.id}&t=${token}` : null,
    },
    rows,
  };
}

/**
 * Every parking row for the event, as a spreadsheet.
 *
 * Excel reads a leading equals, plus, minus or at sign in a cell as a formula,
 * so any field that starts with one is quoted and prefixed. None of these
 * columns should ever contain one, which is exactly why it is worth handling:
 * the one that does will be a note somebody typed.
 */
export function reportCsv(report: EventReport): string {
  const header = [
    'created_at_central',
    'kind',
    'amount_cents',
    'vehicle_count',
    'square_fee_cents',
    'source',
    'square_payment_id',
    'square_order_id',
    'recorded_by',
    'note',
  ];

  const cell = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const lines = [header.join(',')];

  /* Oldest first, which is the order somebody reads a night in. */
  for (const row of [...report.rows].reverse()) {
    lines.push(
      [
        new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }),
        row.kind,
        row.amount_cents,
        row.vehicle_count,
        row.square_fee_cents ?? '',
        row.source,
        row.square_payment_id ?? '',
        row.square_order_id ?? '',
        row.recorded_by ?? '',
        row.note ?? '',
      ]
        .map(cell)
        .join(',')
    );
  }

  return lines.join('\r\n');
}

export const REPORT_TO = SITE.ownerEmail;
