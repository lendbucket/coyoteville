import type { Metadata, Viewport } from 'next';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminShell from '@/components/admin/AdminShell';
import { loginErrorMessage } from '@/components/admin/login-errors';
import type { VendorCardRow } from '@/components/admin/types';
import StringLights from '@/components/StringLights';
import { getAbandoned, howLongAgo, lastReminderFrom } from '@/lib/abandoned';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin-auth';
import { getAdminView, normaliseFilters } from '@/lib/admin-data';
import { lastMediaSendFrom } from '@/lib/media-log';
import { lastComposeSendFrom } from '@/lib/compose-log';
import { getWaitlist } from '@/lib/waitlist';
import { EVENTS, PRICING, nextEventByDate } from '@/lib/seo';
import { dayKeyFromTimestamp, formatDayLong } from '@/lib/booking';
import { DAY_SCOPE, SCOPE_LABELS, isEventScope } from '@/lib/admin-scope';
import { bookingWindow, getDayStatuses } from '@/lib/days';

/**
 * Never cached, at any layer.
 *
 * force-dynamic keeps the route out of the full route cache and, in Next 14,
 * defaults the fetches inside it to no-store, which covers the Supabase reads.
 * revalidate = 0 is stated as well rather than left implied: this is the page
 * where a cached row means a paid vendor sitting unseen in the review queue,
 * and that is worth spelling out where somebody will read it.
 *
 * Deliberately NOT done: no-store on the shared Supabase client itself. That
 * client is used by the public pages too, and an uncached fetch inside them
 * would opt the homepage out of its revalidate = 60 rendering and put a
 * database round trip on every visitor.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Vendor tracker',
  description: 'Staff only. Vendor applications, payment status and spot numbers for Coyoteville events.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  /**
   * The tracker's own manifest, not the site one. The site manifest starts at
   * "/", so installing from it would launch the public page.
   */
  manifest: '/admin/manifest.json',
  appleWebApp: {
    // iOS reads this rather than the manifest to decide about browser chrome.
    capable: true,
    title: 'Tracker',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0B0C',
  width: 'device-width',
  initialScale: 1,
  // Needed for the safe area insets the tab bar pads itself with.
  viewportFit: 'cover',
  // The tracker is dark only; letting it follow the system would wash out the
  // status bar against the header on a light phone.
  colorScheme: 'dark',
};

function money(cents: number): string {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(0)}`;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  /* ------------------------------------------------------------- login */

  if (!(await isAdminRequest())) {
    const errorKey = Array.isArray(searchParams.e) ? searchParams.e[0] : searchParams.e;

    /* The static calendar, not the live schedule. This is the one screen a
       signed out stranger can reach, and it has no business opening a database
       connection to draw a single line of text. */
    const upcoming = nextEventByDate();

    return (
      <main className="adminlogin">
        <StringLights tone="dark" variant="top" swags={4} sag={26} bulbsPerSwag={6} id="adminlogin-lights" />

        <div className="adminlogin__in">
          <AdminLogin initialError={loginErrorMessage(errorKey)} configured={isAdminConfigured()} />

          {/* Which event the tracker opens on, settled before you have even
              typed the password. */}
          <p className="adminlogin__foot">
            Next up: <b>{upcoming.name}</b>
            <span className="adminlogin__dot" aria-hidden="true" />
            <time dateTime={upcoming.date}>{upcoming.displayDate}</time>
          </p>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------ tracker */

  const filters = normaliseFilters(searchParams);
  const eventScoped = isEventScope(filters.event);

  /* The waitlist and the abandoned checkout list are both keyed on an event.
     Neither means anything under the day or monthly scopes, so they are not
     queried at all there rather than run against a slug that matches nothing
     and quietly return empty. */
  const [view, abandoned, waitlist] = await Promise.all([
    getAdminView(filters),
    eventScoped ? getAbandoned(filters.event) : Promise.resolve([]),
    eventScoped ? getWaitlist(filters.event) : Promise.resolve([]),
  ]);

  /* Review slots per day, for the calendar. Only loaded under the day scope:
     it is two more queries across the whole booking window, and under an event
     or monthly scope the calendar is not the panel being used. */
  const dayStatuses = eventScoped
    ? null
    : filters.event === DAY_SCOPE
      ? await (async () => {
          const window = bookingWindow();
          const statuses = await getDayStatuses(window.from, window.to);
          const map: Record<string, { boothLeft: number; truckLeft: number }> = {};
          for (const status of statuses) {
            map[status.day] = {
              boothLeft: status.booth.reviewRemaining,
              truckLeft: status.truck.reviewRemaining,
            };
          }
          return map;
        })()
      : null;

  const selectedEvent =
    EVENTS.find((e) => e.slug === filters.event) ?? nextEventByDate();
  // What the scope is called, for the composer's merge fields and the empty
  // states, so neither claims to be showing an event it is not.
  const scopeName = eventScoped ? selectedEvent.name : SCOPE_LABELS[filters.event];
  const scopeDate = eventScoped ? selectedEvent.displayDate : '';

  // Vendors on this event carrying anything worth handing to whoever posts.
  // Permits are deliberately not counted: they are never sent.
  const withMedia = view.rows.filter((r) => r.logo_path || (r.photo_paths ?? []).length);
  const mediaVendorCount = withMedia.length;
  const mediaFileCount = withMedia.reduce(
    (n, r) => n + (r.logo_path ? 1 : 0) + (r.photo_paths ?? []).length,
    0
  );

  const exportHref = `/api/admin/export?event=${encodeURIComponent(filters.event)}${
    filters.status ? `&status=${encodeURIComponent(filters.status)}` : ''
  }${filters.q ? `&q=${encodeURIComponent(filters.q)}` : ''}`;

  /* The shell is a client component, so the row is flattened here: only what
     the phone actually renders crosses the boundary, and the search and the
     filter chips run against data that is already in the browser. */
  const cardRows: VendorCardRow[] = view.rows.map((r) => ({
    id: r.id,
    businessName: r.business_name,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    spotType: r.spot_type,
    spotTypeLabel:
      r.spot_type === 'truck'
        ? PRICING.truck.label
        : r.spot_type === 'booth'
          ? PRICING.booth.label
          : 'Coyote org',
    spotNumber: r.spot_number,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method,
    amountLabel: r.amount_cents ? money(r.amount_cents) : '',
    amountCents: r.amount_cents,
    amountReceivedCents: r.amount_received_cents,
    /* Cents, not whole dollars: a short payment of $22.50 is exactly the kind
       of thing this exists to show, and money() would round it away. */
    amountReceivedLabel:
      r.amount_received_cents === null ? '' : `$${(r.amount_received_cents / 100).toFixed(2)}`,
    amountReceivedAt: r.amount_received_at ? when(r.amount_received_at) : '',
    approvalStatus: r.approval_status,
    bookingKind: r.booking_kind,
    bookingLabel:
      r.booking_kind === 'day' && r.booking_date
        ? formatDayLong(r.booking_date)
        : r.booking_kind === 'monthly'
          ? 'Permanent monthly spot'
          : (EVENTS.find((e) => e.slug === r.event_slug)?.name ?? 'Event'),
    bookingDay: r.booking_date,
    subscriptionStatus: r.subscription_status,
    /* Stored as a timestamptz, shown as the date it falls on here. Reading it
       through the day key conversion rather than isDayKey directly, which an
       ISO timestamp fails, leaving the sheet showing nothing. */
    subscriptionPeriodEnd: (() => {
      const day = dayKeyFromTimestamp(r.subscription_next_billing_at);
      return day ? formatDayLong(day) : null;
    })(),
    subscriptionCanceling: Boolean(r.subscription_cancel_at_period_end),
    monthlyLabel: r.monthly_amount_cents ? money(r.monthly_amount_cents) : '',
    failedPayments: r.failed_payment_count ?? 0,
    denialReason: r.denial_reason,
    refundLabel: r.refund_amount_cents ? money(r.refund_amount_cents) : '',
    refundError: r.refund_error,
    sells: r.sells,
    servesFood: r.serves_food,
    signed: r.waiver_accepted,
    signatureName: r.signature_name,
    signedAt: when(r.signed_at),
    agreementVersion: r.agreement_version ?? 'version unknown',
    permitUploaded: Boolean(r.permit_path),
    logoUploaded: Boolean(r.logo_path),
    photoCount: (r.photo_paths ?? []).length,
    fileCount: (r.logo_path ? 1 : 0) + (r.photo_paths ?? []).length,
    uploadIssues: r.upload_issues,
    adminNotes: r.admin_notes,
    appliedAt: when(r.created_at),
    lastPhotoSend: lastMediaSendFrom(r.admin_notes),
    lastEmail: lastComposeSendFrom(r.admin_notes),
  }));

  return (
    <main className="admin admin--app">
      <AdminShell
        rows={cardRows}
        revenue={view.revenue}
        waitlist={waitlist}
        counts={view.counts}
        reviewSlots={view.reviewSlots}
        dayStatuses={dayStatuses}
        available={view.available}
        eventName={scopeName}
        eventDate={scopeDate}
        eventSlug={filters.event}
        events={EVENTS.map((e) => ({ slug: e.slug, name: e.name }))}
        filters={filters}
        exportHref={exportHref}
        mediaVendorCount={mediaVendorCount}
        mediaFileCount={mediaFileCount}
        abandoned={abandoned.map((r) => ({
          id: r.id,
          business_name: r.business_name,
          contact_name: r.contact_name,
          phone: r.phone,
          email: r.email,
          spot_type:
            r.spot_type === 'truck'
              ? PRICING.truck.label
              : r.spot_type === 'booth'
                ? PRICING.booth.label
                : PRICING.free.label,
          amount: money(r.amount_cents),
          started: howLongAgo(r.minutesAgo),
          lastReminderAt: r.lastReminderAt,
          canRemind: Boolean(r.square_payment_link_id),
        }))}
      />
    </main>
  );
}
