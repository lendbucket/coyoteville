import type { Metadata } from 'next';
import AdminRevenue from '@/components/AdminRevenue';
import AdminRowControls from '@/components/AdminRowControls';
import AdminAbandoned from '@/components/AdminAbandoned';
import AdminReminderButton from '@/components/AdminReminderButton';
import AdminSendPhotos from '@/components/AdminSendPhotos';
import AdminSendAllPhotos from '@/components/AdminSendAllPhotos';
import { getAbandoned, howLongAgo, lastReminderFrom } from '@/lib/abandoned';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin-auth';
import { getAdminView, normaliseFilters } from '@/lib/admin-data';
import { lastMediaSendFrom } from '@/lib/media-log';
import { EVENTS, PRICING } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor tracker',
  description: 'Staff only. Vendor applications, payment status and spot numbers for Coyoteville events.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const LOGIN_ERRORS: Record<string, string> = {
  bad: 'That password did not match.',
  rate: 'Too many tries. Wait a few minutes.',
  unset: 'ADMIN_PASSWORD is not set on the server yet.',
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
    const error = errorKey ? LOGIN_ERRORS[errorKey] : null;

    return (
      <main className="adminlogin">
        <div className="adminlogin__card">
          <h1>Vendor tracker</h1>
          <p className="hint">Staff only. This page is not indexed and not linked from the site.</p>

          {error ? (
            <p className="formnote formnote--error" role="alert">
              {error}
            </p>
          ) : null}

          {!isAdminConfigured() ? (
            <p className="hint">
              Set <code>ADMIN_PASSWORD</code> in the environment and redeploy before signing in.
            </p>
          ) : null}

          <form className="form" method="POST" action="/api/admin/login">
            <div className="field">
              <label className="label" htmlFor="admin-password">
                Password
              </label>
              <input
                className="input"
                id="admin-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <button className="btn btn--amber" type="submit">
              Sign in
            </button>
          </form>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------ tracker */

  const filters = normaliseFilters(searchParams);
  const [view, abandoned] = await Promise.all([
    getAdminView(filters),
    getAbandoned(filters.event),
  ]);

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

  return (
    <main className="admin">
      <header className="admin__top">
        <div className="admin__titlerow">
          <h1>Vendor tracker</h1>
          <form method="POST" action="/api/admin/logout">
            <button className="btn btn--ghost btn--sm" type="submit">
              Sign out
            </button>
          </form>
        </div>

        <AdminRevenue revenue={view.revenue} />

        <ul className="admin__counts">
          <li>
            <b>{view.counts.total}</b>
            <span>Total</span>
          </li>
          <li>
            <b>{view.counts.paid}</b>
            <span>Paid or free</span>
          </li>
          <li>
            <b>{view.counts.unpaid}</b>
            <span>Unpaid</span>
          </li>
        </ul>

        {/* GET form, so filters live in the URL and a view can be bookmarked
            or reloaded at the gate without losing place. */}
        <form className="admin__filters" method="GET" action="/admin">
          <label className="field">
            <span className="label">Event</span>
            <select className="select" name="event" defaultValue={filters.event}>
              {EVENTS.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">Payment</span>
            <select className="select" name="status" defaultValue={filters.status}>
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="not_required">Free spot</option>
              <option value="unpaid">Unpaid</option>
              <option value="refunded">Refunded</option>
              <option value="expired">Expired</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Business name</span>
            <input
              className="input"
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Search"
            />
          </label>

          <div className="admin__filteractions">
            <button className="btn btn--amber btn--sm" type="submit">
              Apply
            </button>
            <a className="btn btn--ghost btn--sm" href={exportHref}>
              Export CSV
            </a>
          </div>
        </form>

        {/* Everything for this event in one handoff, for whoever is posting. */}
        <AdminSendAllPhotos
          event={filters.event}
          vendorCount={mediaVendorCount}
          fileCount={mediaFileCount}
        />
      </header>

      <AdminAbandoned
        rows={abandoned.map((r) => ({
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

      {!view.available ? (
        <p className="formnote formnote--error">
          Could not read applications. Check the Supabase environment variables.
        </p>
      ) : view.rows.length === 0 ? (
        <p className="admin__empty">No applications match this view.</p>
      ) : (
        <ol className="admin__list">
          {view.rows.map((r) => {
            const photos = r.photo_paths ?? [];

            return (
              <li className="arow" key={r.id}>
                <div className="arow__head">
                  <div>
                    <h2 className="arow__name">{r.business_name}</h2>
                    <p className="arow__contact">
                      {r.contact_name} &middot;{' '}
                      <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a> &middot;{' '}
                      <a href={`mailto:${r.email}`}>{r.email}</a>
                    </p>
                  </div>

                  <div className="arow__tags">
                    <span className={`tag tag--${r.spot_type}`}>
                      {r.spot_type === 'truck'
                        ? PRICING.truck.label
                        : r.spot_type === 'booth'
                          ? PRICING.booth.label
                          : 'Coyote org'}
                    </span>
                    <span
                      className={`tag ${
                        r.payment_status === 'paid' || r.payment_status === 'not_required'
                          ? 'tag--ok'
                          : 'tag--warn'
                      }`}
                    >
                      {r.payment_status === 'not_required' ? 'Free' : r.payment_status}
                      {r.amount_cents ? ` ${money(r.amount_cents)}` : ''}
                    </span>
                    {r.payment_method === 'offline' ? (
                      <span className="tag tag--prepaid">Prepaid link</span>
                    ) : r.payment_method === 'online' ? (
                      <span className="tag tag--web">Website</span>
                    ) : null}
                    {r.spot_number ? <span className="tag tag--spot">Spot {r.spot_number}</span> : null}
                  </div>
                </div>

                <dl className="arow__facts">
                  <div>
                    <dt>Sells</dt>
                    <dd>
                      {r.sells}
                      {r.serves_food ? ' · serves food' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Agreement</dt>
                    <dd>
                      {r.waiver_accepted ? (
                        <>
                          Signed by <b>{r.signature_name}</b>
                          <br />
                          {when(r.signed_at)} &middot; {r.agreement_version ?? 'version unknown'}
                        </>
                      ) : (
                        <span className="arow__missing">Not signed</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>DSHS health permit</dt>
                    <dd>
                      {r.permit_path ? (
                        <a
                          className="arow__permit"
                          href={`/api/admin/file?id=${r.id}&kind=permit`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Uploaded &middot; view
                        </a>
                      ) : (
                        <span
                          className={
                            r.spot_type === 'truck' || r.serves_food ? 'arow__missing' : undefined
                          }
                        >
                          {r.spot_type === 'truck' || r.serves_food ? 'Missing' : 'Not required'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Applied</dt>
                    <dd>{when(r.created_at)}</dd>
                  </div>
                </dl>

                {r.logo_path || photos.length ? (
                  <div className="arow__media">
                    {r.logo_path ? (
                      <a
                        href={`/api/admin/file?id=${r.id}&kind=logo`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/admin/file?id=${r.id}&kind=logo`}
                          alt={`${r.business_name} logo`}
                          loading="lazy"
                        />
                        <span>Logo</span>
                      </a>
                    ) : null}

                    {photos.map((_, i) => (
                      <a
                        key={i}
                        href={`/api/admin/file?id=${r.id}&kind=photo&i=${i}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/admin/file?id=${r.id}&kind=photo&i=${i}`}
                          alt={`${r.business_name} photo ${i + 1}`}
                          loading="lazy"
                        />
                        <span>Photo {i + 1}</span>
                      </a>
                    ))}
                  </div>
                ) : null}

                {r.logo_path || photos.length ? (
                  <div className="arow__send">
                    <AdminSendPhotos
                      id={r.id}
                      businessName={r.business_name}
                      fileCount={(r.logo_path ? 1 : 0) + photos.length}
                      lastSend={lastMediaSendFrom(r.admin_notes)}
                    />
                  </div>
                ) : null}

                {r.notes ? <p className="arow__notes">{r.notes}</p> : null}

                {r.upload_issues ? (
                  <p className="arow__uploadissue">
                    Upload problem: {r.upload_issues}. The application went through anyway, so
                    chase the file if you need it.
                  </p>
                ) : null}

                {r.payment_status === 'unpaid' ? (
                  <div className="arow__remind">
                    <AdminReminderButton
                      id={r.id}
                      lastReminderAt={lastReminderFrom(r.admin_notes)}
                      canRemind={Boolean(r.square_payment_link_id)}
                    />
                  </div>
                ) : null}

                <AdminRowControls
                  id={r.id}
                  approvalStatus={r.approval_status}
                  spotNumber={r.spot_number}
                />
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
