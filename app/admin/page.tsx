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

export const dynamic = 'force-dynamic';

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
  const [view, abandoned, waitlist] = await Promise.all([
    getAdminView(filters),
    getAbandoned(filters.event),
    getWaitlist(filters.event),
  ]);

  const selectedEvent = EVENTS.find((e) => e.slug === filters.event) ?? EVENTS[0];

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
    approvalStatus: r.approval_status,
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
        available={view.available}
        eventName={selectedEvent.name}
        eventDate={selectedEvent.displayDate}
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
