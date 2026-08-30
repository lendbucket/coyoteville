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
  approvalStatus: string;
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
  appliedAt: string;
  lastPhotoSend: { to: string; at: string } | null;
  lastEmail: { to: string; at: string; subject: string } | null;
};

export type FilterKey = 'all' | 'review' | 'paid' | 'unpaid' | 'truck' | 'booth' | 'free';

/* 'Review' sits first because it is the only chip that is a job rather than a
   view, and the whole point of the queue is that it cannot be missed. */
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'truck', label: 'Trucks' },
  { key: 'booth', label: 'Booths' },
  { key: 'free', label: 'Orgs' },
];

/** Settled means paid or a free spot, the same pair used everywhere else. */
export function isSettled(row: VendorCardRow): boolean {
  return row.paymentStatus === 'paid' || row.paymentStatus === 'not_required';
}

/**
 * Waiting on a decision: the money is in and nobody has ruled on it yet. The
 * same rule the pending count on the server uses, so the badge and the chip can
 * never disagree with the banner.
 */
export function needsReview(row: VendorCardRow): boolean {
  return isSettled(row) && row.approvalStatus === 'pending';
}

export function matchesFilter(row: VendorCardRow, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'review') return needsReview(row);
  if (filter === 'paid') return isSettled(row);
  if (filter === 'unpaid') return row.paymentStatus === 'unpaid';
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
