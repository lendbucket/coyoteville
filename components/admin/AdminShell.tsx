'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AdminRevenue from '../AdminRevenue';
import AdminAbandoned from '../AdminAbandoned';
import AdminSendAllPhotos from '../AdminSendAllPhotos';
import AdminWaitlist from '../AdminWaitlist';
import VendorCard from './VendorCard';
import VendorSheet from './VendorSheet';
import Composer from './Composer';
import { FILTERS, matchesFilter, matchesQuery, type FilterKey, type VendorCardRow } from './types';
import type { RevenueSummary } from '@/lib/revenue';
import type { WaitlistEntry } from '@/lib/waitlist';

/**
 * The tracker shell.
 *
 * Narrow screens get an app: four tabs on a bar at the bottom where a thumb
 * reaches, one panel at a time, a sheet for detail. Wide screens get every
 * panel stacked, which is what the page already was. That split is done in CSS
 * rather than by branching on a width in JavaScript, so there is no flash of
 * the wrong layout before hydration and no resize listener to get wrong.
 *
 * Search and the filter chips run against rows that are already here. Going
 * back to the server per keystroke was fine on a desktop and is not fine on a
 * phone on the far side of a stadium.
 */

const TABS = [
  { key: 'vendors', label: 'Vendors' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'money', label: 'Money' },
  { key: 'compose', label: 'Compose' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function TabIcon({ tab }: { tab: TabKey }) {
  const paths: Record<TabKey, string> = {
    vendors: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.3 0-6 1.2-6 3.5V20h7v-2.5c0-.9.5-1.9 1.3-2.7A9.6 9.6 0 0 0 8 14Zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z',
    waitlist: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.6 4 2.3-.8 1.4L11 13V6h2Z',
    money: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm.9 15.3v1.4h-1.6v-1.4a4 4 0 0 1-2.9-1.7l1.3-1.1a2.7 2.7 0 0 0 2.3 1.2c1 0 1.7-.4 1.7-1.2s-.6-1-2-1.4c-1.7-.5-3-1.1-3-2.9a2.9 2.9 0 0 1 2.6-2.8V6h1.6v1.4a3.6 3.6 0 0 1 2.5 1.5l-1.3 1.1a2.3 2.3 0 0 0-1.9-1c-1 0-1.5.5-1.5 1.1s.6 1 2 1.4c1.8.5 3 1.2 3 3a3 3 0 0 1-2.8 2.8Z',
    compose: 'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z',
  };

  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d={paths[tab]} />
    </svg>
  );
}

/** Placeholder cards while a refresh is in flight, so nothing jumps. */
function Skeletons() {
  return (
    <ul className="vlist" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li className="vcard vcard--skeleton" key={i}>
          <span className="sk sk--title" />
          <span className="sk sk--badges" />
          <span className="sk sk--meta" />
        </li>
      ))}
    </ul>
  );
}

export default function AdminShell({
  rows,
  revenue,
  waitlist,
  abandoned,
  counts,
  eventName,
  eventDate,
  eventSlug,
  events,
  filters,
  exportHref,
  mediaVendorCount,
  mediaFileCount,
  available,
}: {
  rows: VendorCardRow[];
  revenue: RevenueSummary | null;
  waitlist: WaitlistEntry[];
  abandoned: React.ComponentProps<typeof AdminAbandoned>['rows'];
  counts: { total: number; paid: number; unpaid: number };
  eventName: string;
  eventDate: string;
  eventSlug: string;
  events: { slug: string; name: string }[];
  filters: { event: string; status: string; q: string };
  exportHref: string;
  mediaVendorCount: number;
  mediaFileCount: number;
  available: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const [tab, setTab] = useState<TabKey>('vendors');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visible = useMemo(
    () => rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query)),
    [rows, filter, query]
  );

  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  /* ------------------------------------------------------ pull to refresh */

  const listRef = useRef<HTMLDivElement | null>(null);
  const pullStart = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  const refresh = useCallback(() => {
    startRefresh(() => router.refresh());
  }, [router]);

  const onTouchStart = (e: React.TouchEvent) => {
    // Only arm the gesture at the very top, so it cannot fight normal scrolling.
    const el = listRef.current;
    if (!el || el.scrollTop > 0) return;
    pullStart.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStart.current === null) return;
    const delta = e.touches[0].clientY - pullStart.current;
    if (delta > 0) setPull(Math.min(delta * 0.5, 90));
  };

  const onTouchEnd = () => {
    if (pullStart.current === null) return;
    if (pull > 55) refresh();
    pullStart.current = null;
    setPull(0);
  };

  /* Opening the composer from a vendor's sheet selects them and switches tab. */
  const emailVendor = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setOpenId(null);
    setTab('compose');
  }, []);

  /* Turning on selection mode from the compose tab is the discoverable path,
     so going to Compose with nothing picked sends you back with it armed. */
  useEffect(() => {
    if (tab === 'compose' && selectedIds.length === 0) setSelectMode(true);
  }, [tab, selectedIds.length]);

  const showSkeletons = refreshing && rows.length > 0;

  return (
    <div className="ash" data-tab={tab}>
      {/* ------------------------------------------------------------ top */}
      <header className="ash__top">
        <div className="ash__titlerow">
          <h1 className="ash__title">Vendor tracker</h1>
          <form method="POST" action="/api/admin/logout">
            <button className="ash__signout" type="submit">
              Sign out
            </button>
          </form>
        </div>

        {/* Event and export stay in the URL, so a view can still be bookmarked
            and the server keeps doing the event scoping. */}
        <form className="ash__eventrow" method="GET" action="/admin">
          <select
            className="select ash__eventsel"
            name="event"
            defaultValue={filters.event}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            aria-label="Event"
          >
            {events.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
          <a className="ash__export" href={exportHref}>
            CSV
          </a>
        </form>
      </header>

      {/* -------------------------------------------------------- vendors */}
      <section className="ash__panel" data-panel="vendors" aria-label="Vendors">
        <div className="ash__search">
          <input
            className="input ash__searchInput"
            type="search"
            inputMode="search"
            placeholder="Search name, contact, phone, spot"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search vendors"
          />
          <button
            className={`ash__select ${selectMode ? 'is-on' : ''}`}
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              if (selectMode) setSelectedIds([]);
            }}
            aria-pressed={selectMode}
          >
            {selectMode ? 'Done' : 'Select'}
          </button>
        </div>

        <div className="fchips" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`fchip ${filter === f.key ? 'is-on' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {selectMode ? (
          <div className="ash__selbar">
            <span>{selectedIds.length} selected</span>
            <div>
              <button type="button" onClick={() => setSelectedIds(visible.map((r) => r.id))}>
                All {visible.length}
              </button>
              <button type="button" onClick={() => setSelectedIds([])}>
                None
              </button>
              <button type="button" className="is-primary" onClick={() => setTab('compose')}>
                Email
              </button>
            </div>
          </div>
        ) : null}

        <div
          className="ash__list"
          ref={listRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="ash__pull"
            style={{ height: pull }}
            aria-hidden={pull === 0}
          >
            {pull > 55 ? 'Release to refresh' : pull > 0 ? 'Pull to refresh' : ''}
          </div>

          {!available ? (
            <p className="formnote formnote--error">
              Could not read applications. Check the Supabase environment variables.
            </p>
          ) : showSkeletons ? (
            <Skeletons />
          ) : visible.length === 0 ? (
            <p className="ash__empty">
              {rows.length === 0 ? 'No applications for this event yet.' : 'Nothing matches that.'}
            </p>
          ) : (
            <ul className="vlist">
              {visible.map((row) => (
                <VendorCard
                  key={row.id}
                  row={row}
                  onOpen={setOpenId}
                  selectable={selectMode}
                  selected={selectedIds.includes(row.id)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}

          <div className="ash__afterlist">
            <AdminSendAllPhotos
              event={eventSlug}
              vendorCount={mediaVendorCount}
              fileCount={mediaFileCount}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- waitlist */}
      <section className="ash__panel" data-panel="waitlist" aria-label="Waitlist">
        <AdminAbandoned rows={abandoned} />
        {waitlist.length ? (
          <AdminWaitlist entries={waitlist} eventName={eventName} />
        ) : (
          <p className="ash__empty">Nobody is on the waitlist for {eventName}.</p>
        )}
      </section>

      {/* ---------------------------------------------------------- money */}
      <section className="ash__panel" data-panel="money" aria-label="Money">
        <AdminRevenue revenue={revenue} />
        <ul className="admin__counts">
          <li>
            <b>{counts.total}</b>
            <span>Total</span>
          </li>
          <li>
            <b>{counts.paid}</b>
            <span>Paid or free</span>
          </li>
          <li>
            <b>{counts.unpaid}</b>
            <span>Unpaid</span>
          </li>
        </ul>
      </section>

      {/* -------------------------------------------------------- compose */}
      <section className="ash__panel" data-panel="compose" aria-label="Compose">
        <Composer
          rows={visible}
          selectedIds={selectedIds}
          onToggle={toggle}
          onClearSelection={() => setSelectedIds([])}
          onSelectAll={() => setSelectedIds(visible.map((r) => r.id))}
          eventDate={eventDate}
          onSent={refresh}
        />
      </section>

      <VendorSheet row={openRow} onClose={() => setOpenId(null)} onEmail={emailVendor} />

      {/* --------------------------------------------------------- tabbar */}
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tabbar__tab ${tab === t.key ? 'is-on' : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            <TabIcon tab={t.key} />
            <span>{t.label}</span>
            {t.key === 'compose' && selectedIds.length ? (
              <span className="tabbar__badge">{selectedIds.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
