import 'server-only';
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase';
import { getEvents } from './events-source';
import { PAYOUT_WINDOW_DAYS } from './parking-fundraiser';
import {
  PROCESSING_FEE_RATE,
  emptyTotals,
  getParkingLedger,
  getParkingTotals,
  kindLabel,
  type ParkingTotals,
  type ShareBasis,
} from './parking';

/**
 * Everything the organization's live page shows, assembled in one place.
 *
 * One read, one shape, used by the page's first render and by the route it
 * polls. Two code paths producing the same screen is how a number that is right
 * on load becomes wrong ten seconds later, and this is a page a team's parents
 * are watching while the game is on.
 *
 * Nothing here is about a payer. The ledger carries a time, an amount and a
 * label, and that is the whole row: an organization is entitled to see the
 * money it earned arriving and is not entitled to see who arrived in what car.
 */

export type LiveLedgerLine = {
  id: string;
  at: string;
  amountCents: number;
  /** "parking" or "gift". Nothing about the payer, ever. */
  label: string;
};

/**
 * The sentence under the numbers.
 *
 * Says what Square took and why the share is what it is. Two versions because
 * the basis is a term of an agreement: an organization on 'gross' is paid on
 * the money before the fee, which is what the terms they signed say, and one on
 * 'net' would be paid after it. Whichever applies, it is stated on the page
 * rather than left for them to work out from two numbers that do not divide.
 */
export function feeSentence(basis: ShareBasis): string {
  const rate = `${(PROCESSING_FEE_RATE * 100).toFixed(2).replace(/0$/, '')}%`;
  const shared =
    `Card processing costs ${rate} on every payment. We show it so you can see exactly where ` +
    'every dollar went.';

  return basis === 'net'
    ? `${shared} Your share is half of what is left after that fee.`
    : `${shared} Your share is half of the total before that fee, as your terms say.`;
}

export type LiveSnapshot = {
  org: { id: string; name: string; logoPath: string | null };
  event: { slug: string; name: string; displayDate: string; endsAtISO: string };
  totals: ParkingTotals;
  ledger: LiveLedgerLine[];
  /** The date the payout is due: the night, plus the window in the terms. */
  payByISO: string;
  /** Set once Robert records the payout. Null until then. */
  paidAtISO: string | null;
};

/**
 * The award this token opens, and the night it is for.
 *
 * Keyed on the organization rather than the event, because that is what the
 * token is minted against and what the organization is: one organization works
 * one game, and the link they were sent belongs to them rather than to a date.
 *
 * Picks the most recent award for that organization. A repeat organization has
 * more than one over a season, and the one they want is the one they just
 * worked.
 */
export async function getLiveSnapshot(orgId: string): Promise<LiveSnapshot | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabaseAdmin();

    const { data: org } = await supabase
      .from('org_applications')
      .select('id, org_name, logo_path')
      .eq('id', orgId)
      .maybeSingle();

    if (!org) return null;
    const orgRow = org as { id: string; org_name: string; logo_path: string | null };

    const { data: awards } = await supabase
      .from('org_event_awards')
      .select('event_slug, paid_at, picked_at')
      .eq('org_application_id', orgId)
      .order('picked_at', { ascending: false })
      .limit(10);

    const rows = (awards ?? []) as { event_slug: string; paid_at: string | null }[];
    if (!rows.length) return null;

    /* The night they worked, resolved against the calendar. An award naming a
       slug the events table has forgotten is skipped rather than rendered as a
       page about nothing. */
    const events = await getEvents();
    const award = rows.find((a) => events.some((e) => e.slug === a.event_slug)) ?? null;
    if (!award) return null;

    const event = events.find((e) => e.slug === award.event_slug);
    if (!event) return null;

    const [totals, ledger] = await Promise.all([
      getParkingTotals(event.slug),
      getParkingLedger(event.slug),
    ]);

    return {
      org: { id: orgRow.id, name: orgRow.org_name, logoPath: orgRow.logo_path },
      event: {
        slug: event.slug,
        name: event.name,
        displayDate: event.displayDate,
        endsAtISO: event.endISO,
      },
      totals,
      ledger: ledger.map((row) => ({
        id: row.id,
        at: row.created_at,
        amountCents: row.amount_cents,
        label: kindLabel(row.kind),
      })),
      payByISO: payByFor(event.endISO),
      paidAtISO: award.paid_at,
    };
  } catch (err) {
    console.error('could not build the live snapshot', err);
    return null;
  }
}

/** The night plus the payout window in the program terms. */
export function payByFor(endsAtISO: string): string {
  const ends = Date.parse(endsAtISO);
  if (!Number.isFinite(ends)) return '';
  return new Date(ends + PAYOUT_WINDOW_DAYS * 86_400_000).toISOString();
}

/** "September 18, 2026", in Central, for a date somebody reads on a phone. */
export function dateLabel(iso: string | null): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'long',
  }).format(new Date(at));
}

/** "9:42 PM", in Central. The ledger's left column. */
export function timeLabel(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

export { emptyTotals };
