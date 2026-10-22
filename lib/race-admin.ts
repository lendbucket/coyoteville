import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  AGE_GROUPS,
  RACE_TIERS,
  SHIRT_SIZES,
  type RaceTier,
  type ShirtSize,
} from '@/lib/race';

/**
 * Everything the Race tab reads and everything it writes.
 *
 * One module so the tracker, the three exports and the webhook all agree about
 * what a runner is. The alternative is each route selecting its own columns and
 * drifting, which is how the export and the screen end up disagreeing about who
 * paid on the morning somebody is holding a phone at a folding table.
 */

/* ------------------------------------------------------------------ shapes */

/**
 * Every column the tracker needs, medical_notes included.
 *
 * medical_notes is read here because the tracker row shows it. It must never
 * reach the runner CSV: that file gets printed and left on a table in a parking
 * lot, and a runner's medical condition is not something a stranger picks up
 * with the results. The rule is written next to the column in SCHEMA.md and
 * check-race-export fails the build if it ever appears in that export's
 * headers.
 */
const RUNNER_COLUMNS = [
  'id',
  'race_slug',
  'group_id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'age_on_race_day',
  'gender',
  'city',
  'state',
  'emergency_contact_name',
  'emergency_contact_phone',
  'medical_notes',
  'tier',
  'team_name',
  'shirt_size',
  'bib_name',
  'amount_cents',
  'payment_status',
  'bib_number',
  'checked_in_at',
  'shirt_collected',
  'is_minor',
  'guardian_name',
  'created_at',
].join(', ');

export type RunnerRow = {
  id: string;
  groupId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  ageOnRaceDay: number | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  /** Admin only. Never exported. */
  medicalNotes: string | null;
  tier: RaceTier;
  teamName: string | null;
  shirtSize: ShirtSize | null;
  bibName: string | null;
  amountCents: number;
  paymentStatus: string;
  bibNumber: number | null;
  checkedInAt: string | null;
  shirtCollected: boolean;
  isMinor: boolean;
  guardianName: string | null;
};

export type GroupRow = {
  id: string;
  groupType: string;
  groupName: string | null;
  captainName: string | null;
  captainEmail: string | null;
  captainPhone: string | null;
  runnerCount: number | null;
  amountCents: number;
  paymentStatus: string;
};

export type SponsorRow = {
  id: string;
  level: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  amountCents: number;
  paymentStatus: string;
  agreementVersion: string | null;
  signedAt: string | null;
  publishedAt: string | null;
};

export type RaceAdminView = {
  /** Registered, paid and unpaid, per tier and in total. */
  byTier: Record<RaceTier | 'total', { registered: number; paid: number; unpaid: number }>;
  /** The number handed to the printer, per size. */
  shirts: Record<ShirtSize, number>;
  shirtTotal: number;
  runners: RunnerRow[];
  groups: GroupRow[];
  sponsors: SponsorRow[];
  checkedIn: number;
  bibbed: number;
};

/* ------------------------------------------------------------------- reads */

const settled = (status: string) => status === 'paid' || status === 'not_required';

export async function getRaceAdminView(raceSlug: string): Promise<RaceAdminView> {
  const supabase = getSupabaseAdmin();

  const [runnersRes, groupsRes, sponsorsRes] = await Promise.all([
    supabase
      .from('race_registrations')
      .select(RUNNER_COLUMNS)
      .eq('race_slug', raceSlug)
      /* Last name then first name, which is the order the check-in table is
         read in and the order both runner exports are sorted by. Done in
         Postgres so the tracker and the CSV cannot disagree about it. */
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
    supabase
      .from('race_groups')
      .select(
        'id, group_type, group_name, captain_name, captain_email, captain_phone, runner_count, amount_cents, payment_status'
      )
      .eq('race_slug', raceSlug)
      .order('group_name', { ascending: true }),
    supabase
      .from('race_sponsors')
      .select(
        'id, level, business_name, contact_name, email, amount_cents, payment_status, agreement_version, signed_at, published_at'
      )
      .eq('race_slug', raceSlug)
      .order('amount_cents', { ascending: false }),
  ]);

  if (runnersRes.error) throw runnersRes.error;
  if (groupsRes.error) throw groupsRes.error;
  if (sponsorsRes.error) throw sponsorsRes.error;

  const runnerRows = (runnersRes.data ?? []) as unknown as Record<string, unknown>[];
  const runners: RunnerRow[] = runnerRows.map((r) => ({
    id: String(r.id),
    groupId: (r.group_id as string | null) ?? null,
    firstName: String(r.first_name ?? ''),
    lastName: String(r.last_name ?? ''),
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    ageOnRaceDay: (r.age_on_race_day as number | null) ?? null,
    gender: (r.gender as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    emergencyContactName: String(r.emergency_contact_name ?? ''),
    emergencyContactPhone: String(r.emergency_contact_phone ?? ''),
    medicalNotes: (r.medical_notes as string | null) ?? null,
    tier: r.tier as RaceTier,
    teamName: (r.team_name as string | null) ?? null,
    shirtSize: (r.shirt_size as ShirtSize | null) ?? null,
    bibName: (r.bib_name as string | null) ?? null,
    amountCents: Number(r.amount_cents ?? 0),
    paymentStatus: String(r.payment_status ?? 'unpaid'),
    bibNumber: (r.bib_number as number | null) ?? null,
    checkedInAt: (r.checked_in_at as string | null) ?? null,
    shirtCollected: Boolean(r.shirt_collected),
    isMinor: Boolean(r.is_minor),
    guardianName: (r.guardian_name as string | null) ?? null,
  }));

  /* Counts per tier. Registered is everything not refunded, because a refunded
     entry is somebody who is not running. */
  const blank = () => ({ registered: 0, paid: 0, unpaid: 0 });
  const byTier = {
    ...Object.fromEntries(RACE_TIERS.map((t) => [t, blank()])),
    total: blank(),
  } as RaceAdminView['byTier'];

  const shirts = Object.fromEntries(SHIRT_SIZES.map((s) => [s, 0])) as Record<ShirtSize, number>;
  let shirtTotal = 0;
  let checkedIn = 0;
  let bibbed = 0;

  for (const r of runners) {
    if (r.paymentStatus === 'refunded') continue;

    const row = byTier[r.tier] ?? byTier.total;
    row.registered += 1;
    byTier.total.registered += 1;

    if (settled(r.paymentStatus)) {
      row.paid += 1;
      byTier.total.paid += 1;
    } else {
      row.unpaid += 1;
      byTier.total.unpaid += 1;
    }

    /* A shirt counts when it is paid for. An unpaid entry's size is a guess at
       what somebody might order, and the printer is not a guess. */
    if (r.shirtSize && settled(r.paymentStatus)) {
      shirts[r.shirtSize] = (shirts[r.shirtSize] ?? 0) + 1;
      shirtTotal += 1;
    }

    if (r.checkedInAt) checkedIn += 1;
    if (r.bibNumber !== null) bibbed += 1;
  }

  const groupRows = (groupsRes.data ?? []) as unknown as Record<string, unknown>[];
  const groups: GroupRow[] = groupRows.map((g) => ({
    id: String(g.id),
    groupType: String(g.group_type ?? ''),
    groupName: (g.group_name as string | null) ?? null,
    captainName: (g.captain_name as string | null) ?? null,
    captainEmail: (g.captain_email as string | null) ?? null,
    captainPhone: (g.captain_phone as string | null) ?? null,
    runnerCount: (g.runner_count as number | null) ?? null,
    amountCents: Number(g.amount_cents ?? 0),
    paymentStatus: String(g.payment_status ?? 'unpaid'),
  }));

  const sponsorRows = (sponsorsRes.data ?? []) as unknown as Record<string, unknown>[];
  const sponsors: SponsorRow[] = sponsorRows.map((s) => ({
    id: String(s.id),
    level: String(s.level ?? ''),
    businessName: String(s.business_name ?? ''),
    contactName: (s.contact_name as string | null) ?? null,
    email: (s.email as string | null) ?? null,
    amountCents: Number(s.amount_cents ?? 0),
    paymentStatus: String(s.payment_status ?? 'unpaid'),
    agreementVersion: (s.agreement_version as string | null) ?? null,
    signedAt: (s.signed_at as string | null) ?? null,
    publishedAt: (s.published_at as string | null) ?? null,
  }));

  return { byTier, shirts, shirtTotal, runners, groups, sponsors, checkedIn, bibbed };
}

/* ------------------------------------------------------------------ writes */

/**
 * Number every paid runner who has no number, from 1, in last name order.
 *
 * Rerunnable, and that is the requirement rather than a nicety: it gets run
 * once when entries close, then again after the people who registered on race
 * morning are paid, and it must not renumber anybody who already has a bib
 * printed on a sheet in somebody's hand.
 *
 * So: existing numbers are read first and treated as taken, the lowest free
 * number is handed out next, and anybody already numbered is skipped. Running
 * it twice with nothing new paid writes nothing at all.
 */
export async function assignBibs(raceSlug: string): Promise<{ assigned: number; highest: number }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('race_registrations')
    .select('id, bib_number, payment_status, last_name, first_name')
    .eq('race_slug', raceSlug)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    bib_number: number | null;
    payment_status: string;
    last_name: string;
    first_name: string;
  }[];

  const taken = new Set<number>();
  for (const r of rows) if (r.bib_number !== null) taken.add(r.bib_number);

  /* Paid, not refunded, and not already numbered. */
  const waiting = rows.filter((r) => r.bib_number === null && settled(r.payment_status));

  let next = 1;
  let assigned = 0;

  for (const runner of waiting) {
    while (taken.has(next)) next += 1;

    /* One at a time, and guarded on bib_number still being null. Two people
       tapping Assign at once would otherwise both read null and both write the
       same number, and race_registrations_bib_unique would reject the second
       with 23505 after the first had already landed. The guard makes the loser
       a no-op instead of an error. */
    const { data: wrote, error: writeError } = await supabase
      .from('race_registrations')
      .update({ bib_number: next })
      .eq('id', runner.id)
      .is('bib_number', null)
      .select('id');

    if (writeError) throw writeError;

    if ((wrote ?? []).length) {
      taken.add(next);
      assigned += 1;
    }
    next += 1;
  }

  return { assigned, highest: taken.size ? Math.max(...taken) : 0 };
}

/** Stamp or clear check-in. Idempotent: the stamp is set, not incremented. */
export async function setCheckedIn(id: string, on: boolean): Promise<string | null> {
  const at = on ? new Date().toISOString() : null;

  const { error } = await getSupabaseAdmin()
    .from('race_registrations')
    .update({ checked_in_at: at })
    .eq('id', id);

  if (error) throw error;
  return at;
}

/**
 * The shirt toggle, deliberately separate from check-in.
 *
 * Somebody can check in and collect a shirt at different tables, or check in on
 * Friday and pick the shirt up on Saturday. One button for both would make the
 * common case wrong.
 */
export async function setShirtCollected(id: string, on: boolean): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('race_registrations')
    .update({ shirt_collected: on })
    .eq('id', id);

  if (error) throw error;
}

/** Publish a sponsor, which is what puts their logo on the public pages. */
export async function setSponsorPublished(id: string, on: boolean): Promise<string | null> {
  const at = on ? new Date().toISOString() : null;

  const { error } = await getSupabaseAdmin()
    .from('race_sponsors')
    .update({ published_at: at })
    .eq('id', id);

  if (error) throw error;
  return at;
}

/* ----------------------------------------------------------------- exports */

/** RFC 4180 quoting: wrap in quotes, double any quote inside. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

/**
 * The runner sheet. Printed, carried around, left on a table.
 *
 * medical_notes is not here and must never be. See the rule in SCHEMA.md and
 * the assertion in check-race-export, which reads these headers and fails the
 * build if it finds it.
 */
export const RUNNER_EXPORT_HEADERS = [
  'Bib',
  'Last name',
  'First name',
  'Age on race day',
  'Gender',
  'Tier',
  'Shirt size',
  'Shirt collected',
  'Paid',
  'Team name',
  'Emergency contact name',
  'Emergency contact phone',
  'City',
  'State',
  'Checked in',
] as const;

export function runnersCsv(view: RaceAdminView): string {
  /* Already last name then first name out of Postgres. */
  const rows = view.runners
    .filter((r) => r.paymentStatus !== 'refunded')
    .map((r) =>
      [
        r.bibNumber ?? '',
        r.lastName,
        r.firstName,
        r.ageOnRaceDay ?? '',
        r.gender ?? '',
        r.tier,
        r.shirtSize ?? '',
        yesNo(r.shirtCollected),
        yesNo(settled(r.paymentStatus)),
        r.teamName ?? '',
        r.emergencyContactName,
        r.emergencyContactPhone,
        r.city ?? '',
        r.state ?? '',
        r.checkedInAt ? 'Yes' : 'No',
      ]
        .map(cell)
        .join(',')
    );

  return [RUNNER_EXPORT_HEADERS.map(cell).join(','), ...rows].join('\r\n');
}

export const AWARD_EXPORT_HEADERS = [
  'Age group',
  'Gender',
  'Bib',
  'Last name',
  'First name',
  'Age on race day',
  'Tier',
] as const;

/**
 * Age group awards, by group then gender then bib.
 *
 * This race is not chip timed, so there are no finish times to rank and nothing
 * on the site promises awards by time. The sheet exists so the groups are
 * already right the year chip_timed goes true, and so somebody standing at a
 * table can find a runner's group without doing arithmetic.
 */
export function awardsCsv(view: RaceAdminView): string {
  const rows: string[] = [];

  for (const group of AGE_GROUPS) {
    const inGroup = view.runners.filter(
      (r) =>
        r.paymentStatus !== 'refunded' &&
        r.ageOnRaceDay !== null &&
        r.ageOnRaceDay >= group.min &&
        r.ageOnRaceDay <= group.max
    );

    /* Whatever genders are actually present, in a stable order, rather than a
       fixed pair. The form does not force a choice between two. */
    const genders = [...new Set(inGroup.map((r) => r.gender ?? 'Not given'))].sort();

    for (const gender of genders) {
      const runners = inGroup
        .filter((r) => (r.gender ?? 'Not given') === gender)
        .sort((a, b) => (a.bibNumber ?? Infinity) - (b.bibNumber ?? Infinity));

      for (const r of runners) {
        rows.push(
          [
            group.label,
            gender,
            r.bibNumber ?? '',
            r.lastName,
            r.firstName,
            r.ageOnRaceDay ?? '',
            r.tier,
          ]
            .map(cell)
            .join(',')
        );
      }
    }
  }

  return [AWARD_EXPORT_HEADERS.map(cell).join(','), ...rows].join('\r\n');
}

export const SPONSOR_EXPORT_HEADERS = [
  'Business name',
  'Level',
  'Amount',
  'Paid',
  'Agreement version',
  'Signed at',
  'Published',
] as const;

/**
 * Sponsor reconciliation, for checking who is on the shirt against who paid.
 *
 * Read on paper, so the amount is a plain number of dollars rather than cents,
 * and signed_at is a date somebody can compare to an email.
 */
export function sponsorsCsv(view: RaceAdminView): string {
  const rows = view.sponsors.map((s) =>
    [
      s.businessName,
      s.level,
      (s.amountCents / 100).toFixed(2),
      yesNo(settled(s.paymentStatus)),
      s.agreementVersion ?? '',
      s.signedAt ?? '',
      s.publishedAt ? 'Yes' : 'No',
    ]
      .map(cell)
      .join(',')
  );

  return [SPONSOR_EXPORT_HEADERS.map(cell).join(','), ...rows].join('\r\n');
}
