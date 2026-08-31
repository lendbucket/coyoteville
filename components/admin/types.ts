/**
 * The vendor row as the phone shell needs it.
 *
 * Flattened on the server and handed down whole, so search and the filter chips
 * run in the browser against data that is already there. Filtering through the
 * URL meant a round trip per keystroke, which at the gate on a bad signal is
 * the difference between a tool and a wait.
 */
export type VendorCardRow = {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  spotType: string;
  spotTypeLabel: string;
  spotNumber: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  amountLabel: string;
  /** Booked fee in cents, so the sheet can prefill what was expected. */
  amountCents: number;
  /** Cash counted by hand, in cents. Null means nobody has reconciled it. */
  amountReceivedCents: number | null;
  /** Already formatted, or empty when there is nothing recorded. */
  amountReceivedLabel: string;
  /** When the cash was counted, formatted. Empty when nothing is recorded. */
  amountReceivedAt: string;
  approvalStatus: string;
  /** 'event', 'day' or 'monthly'. Decides which controls the sheet shows. */
  bookingKind: string;
  /** What they booked, already formatted: an event name, a date, or the plan. */
  bookingLabel: string;
  /** The raw YYYY-MM-DD for a day booking, which the calendar groups on. */
  bookingDay: string | null;
  /** Monthly only. Null on everything else. */
  subscriptionStatus: string | null;
  /** Paid through, formatted. Also the date a cancellation takes effect. */
  subscriptionPeriodEnd: string | null;
  /** True when a cancellation is booked and the spot is running out its month. */
  subscriptionCanceling: boolean;
  /** The monthly fee, formatted. Empty on a one-off booking. */
  monthlyLabel: string;
  /** Consecutive failed charges. Zero when the card is working. */
  failedPayments: number;
  /** The reason typed at denial. Shown back so the decision is auditable. */
  denialReason: string | null;
  /** What was actually sent back, formatted. Empty when nothing was. */
  refundLabel: string;
  /** Set when the automatic refund failed and someone has to finish it by hand. */
  refundError: string | null;
  sells: string;
  servesFood: boolean;
  signed: boolean;
  signatureName: string;
  signedAt: string;
  agreementVersion: string;
  permitUploaded: boolean;
  logoUploaded: boolean;
  photoCount: number;
  fileCount: number;
  uploadIssues: string | null;
  adminNotes: string | null;
  /** When a payment link was last emailed from here, formatted. Empty if never. */
  paymentRequestedAt: string;
  appliedAt: string;
  lastPhotoSend: { to: string; at: string } | null;
  lastEmail: { to: string; at: string; subject: string } | null;
};

export type FilterKey =
  | 'all'
  | 'review'
  | 'paid'
  | 'unpaid'
  | 'kind:event'
  | 'kind:day'
  | 'kind:monthly'
  | 'cash'
  | 'truck'
  | 'booth'
  | 'free';

/* 'Review' sits first because it is the only chip that is a job rather than a
   view, and the whole point of the queue is that it cannot be missed. The kind
   chips come next: with day and monthly bookings in the same list, "what am I
   looking at" is now asked more often than "what did they book". */
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'all', label: 'All' },
  { key: 'kind:event', label: 'Events' },
  { key: 'kind:day', label: 'Daily' },
  { key: 'kind:monthly', label: 'Monthly' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'cash', label: 'Cash owed' },
  { key: 'truck', label: 'Trucks' },
  { key: 'booth', label: 'Booths' },
  { key: 'free', label: 'Orgs' },
];

/** Settled means paid or a free spot, the same pair used everywhere else. */
export function isSettled(row: VendorCardRow): boolean {
  return row.paymentStatus === 'paid' || row.paymentStatus === 'not_required';
}

/**
 * Claims paid, with no cash counted against it.
 *
 * Offline rows are stamped paid by the database the moment the vendor submits
 * the form, before anyone has collected anything. Until somebody records what
 * they actually took, the row is an assertion rather than money, and this is
 * what separates the two. The same rule the unreconciled count on the server
 * uses, so the chip and the badge cannot disagree with it.
 */
export function needsCash(row: VendorCardRow): boolean {
  return isSettled(row) && row.paymentMethod === 'offline' && row.amountReceivedCents === null;
}

/**
 * Owes money right now, and can be asked for it.
 *
 * Narrower than "payment_status is unpaid", on purpose, because two kinds of
 * unpaid row are not a job:
 *
 *   A permanent monthly vendor is supposed to be unpaid before approval. Their
 *   card is authorised and held, and approving them is what takes the first
 *   charge. They bill through a subscription, so there is no link to send.
 *
 *   A row with no fee has nothing to collect. A free organization spot is
 *   'not_required' rather than 'unpaid' and is already excluded, but a booking
 *   that somehow carries no amount would otherwise show up as chaseable.
 *
 * One predicate for the filter chip, its count, and the server side total, so
 * the number on the chip is always the length of the list it opens.
 */
export function owesPayment(row: VendorCardRow): boolean {
  return row.paymentStatus === 'unpaid' && row.bookingKind !== 'monthly' && row.amountCents > 0;
}

/**
 * Waiting on a decision: the money is in and nobody has ruled on it yet. The
 * same rule the pending count on the server uses, so the badge and the chip can
 * never disagree with the banner.
 */
export function needsReview(row: VendorCardRow): boolean {
  /* A monthly application is meant to be unpaid at this stage: its card is
     authorised and held, and approving it is what takes the first charge. So it
     joins the queue on submission rather than on payment, which is the same
     rule the server counts by. */
  const ready = isSettled(row) || row.bookingKind === 'monthly';
  return ready && row.approvalStatus === 'pending';
}

export function matchesFilter(row: VendorCardRow, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'review') return needsReview(row);
  if (filter === 'paid') return isSettled(row);
  if (filter === 'unpaid') return owesPayment(row);
  if (filter === 'cash') return needsCash(row);
  if (filter.startsWith('kind:')) return row.bookingKind === filter.slice(5);
  return row.spotType === filter;
}

/**
 * Search across the fields someone would actually type at the gate: the
 * business, the person, the phone, and the spot number called over a radio.
 */
export function matchesQuery(row: VendorCardRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const digits = q.replace(/\D/g, '');
  const haystack = [
    row.businessName,
    row.contactName,
    row.email,
    row.sells,
    row.spotNumber ?? '',
    row.spotTypeLabel,
  ]
    .join(' ')
    .toLowerCase();

  if (haystack.includes(q)) return true;
  // Phone match ignores formatting, so "3615550142" finds "361 555 0142".
  return digits.length >= 3 && row.phone.replace(/\D/g, '').includes(digits);
}
