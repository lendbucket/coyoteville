'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  daysInMonth,
  formatDayLong,
  formatMonth,
  monthStart,
  weekdayOf,
  type DayKey,
} from '@/lib/booking';

/**
 * Pick a date to set up on.
 *
 * A month grid rather than a list of dates, because a vendor booking an
 * ordinary day is choosing around their own week, and a calendar is the shape
 * that question already has in their head.
 *
 * Availability is fetched a month at a time and cached per month, so paging
 * back and forth does not re-ask. Days that cannot be booked are rendered as
 * disabled buttons rather than removed, since a gap in a calendar tells you
 * nothing about why, and the reason is what a vendor needs in order to pick
 * again. Event dates are labelled with the event and pointed at the event
 * signup instead, which is the one case where the answer is not "try another
 * date" but "you are in the wrong form".
 */

export type DayCell = {
  day: DayKey;
  bookable: boolean;
  reason: string | null;
  eventName: string | null;
  eventSlug: string | null;
  /** Still taking booth applications for this date. */
  boothOpen: boolean;
  /** Still taking food truck applications for this date. */
  truckOpen: boolean;
};

type MonthData = { days: DayCell[]; loading: boolean; error: string | null };

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Whether this spot type in particular can go on this day.
 *
 * The server sends a boolean per type rather than a count, because the count
 * that matters is review slots and not spaces, and a vendor has no use for
 * either number: the question is whether this date takes their application.
 */
function openForSpot(cell: DayCell, spot: string): boolean {
  if (!cell.bookable) return false;
  if (spot === 'truck') return cell.truckOpen;
  if (spot === 'booth') return cell.boothOpen;
  // Free organisation spots do not consume booth or truck capacity.
  return true;
}

function shortReason(cell: DayCell, spot: string): string {
  if (cell.reason === 'event') return cell.eventName ?? 'Event day';
  if (cell.reason === 'closed') return 'Closed';
  if (cell.reason === 'full') return 'Full';
  if (cell.reason === 'past') return 'Past';
  if (cell.reason === 'beyond-horizon') return 'Too far out';
  if (!openForSpot(cell, spot)) return spot === 'truck' ? 'Trucks shut' : 'Booths shut';
  return '';
}

export default function DayPicker({
  value,
  onChange,
  spot,
}: {
  value: DayKey | '';
  onChange: (day: DayKey) => void;
  /** Narrows availability to the type being booked. Empty until they pick one. */
  spot: string;
}) {
  const [cursor, setCursor] = useState<DayKey>(() => monthStart(new Date().toISOString().slice(0, 10)));
  const [months, setMonths] = useState<Record<string, MonthData>>({});
  // Kept in a ref as well, so the fetch effect can check what is already loaded
  // without listing `months` as a dependency and re-running on its own writes.
  const loaded = useRef<Record<string, MonthData>>({});

  const monthKey = cursor.slice(0, 7);

  const load = useCallback(async (start: DayKey) => {
    const key = start.slice(0, 7);
    if (loaded.current[key]) return;

    const pending: MonthData = { days: [], loading: true, error: null };
    loaded.current[key] = pending;
    setMonths((prev) => ({ ...prev, [key]: pending }));

    const last = addDays(start, daysInMonth(start) - 1);

    try {
      const response = await fetch(
        `/api/days?from=${encodeURIComponent(start)}&to=${encodeURIComponent(last)}`
      );
      const data = (await response.json()) as { ok?: boolean; days?: DayCell[] };

      const next: MonthData = data.ok
        ? { days: data.days ?? [], loading: false, error: null }
        : { days: [], loading: false, error: 'Could not load the calendar.' };

      loaded.current[key] = next;
      setMonths((prev) => ({ ...prev, [key]: next }));
    } catch {
      const next: MonthData = {
        days: [],
        loading: false,
        error: 'Could not load the calendar. Check your connection.',
      };
      loaded.current[key] = next;
      setMonths((prev) => ({ ...prev, [key]: next }));
    }
  }, []);

  useEffect(() => {
    void load(cursor);
  }, [cursor, load]);

  const month = months[monthKey] ?? { days: [], loading: true, error: null };

  const byDay = useMemo(() => {
    const map = new Map<DayKey, DayCell>();
    for (const cell of month.days) map.set(cell.day, cell);
    return map;
  }, [month.days]);

  /* The grid. Leading blanks so the first of the month lands under its real
     weekday, which is the whole reason a calendar is easier to read than a
     list. */
  const cells = useMemo(() => {
    const total = daysInMonth(cursor);
    const lead = weekdayOf(cursor);
    const out: (DayKey | null)[] = Array.from({ length: lead }, () => null);
    for (let i = 0; i < total; i += 1) out.push(addDays(cursor, i));
    return out;
  }, [cursor]);

  const selected = value || '';

  return (
    <div className="daypicker">
      <div className="daypicker__head">
        <button
          className="daypicker__nav"
          type="button"
          onClick={() => setCursor(monthStart(addDays(cursor, -1)))}
          aria-label="Previous month"
        >
          &lsaquo;
        </button>
        <span className="daypicker__month" aria-live="polite">
          {formatMonth(cursor)}
        </span>
        <button
          className="daypicker__nav"
          type="button"
          onClick={() => setCursor(addDays(cursor, daysInMonth(cursor)))}
          aria-label="Next month"
        >
          &rsaquo;
        </button>
      </div>

      <div className="daypicker__weekdays" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      {month.error ? (
        <p className="formnote formnote--error" role="alert">
          {month.error}
        </p>
      ) : null}

      <div className="daypicker__grid" role="group" aria-label="Pick a date">
        {cells.map((day, i) => {
          if (!day) return <span className="daypicker__blank" key={`b${i}`} />;

          const cell = byDay.get(day);
          const open = cell ? openForSpot(cell, spot) : false;
          const isSelected = day === selected;
          const note = cell ? shortReason(cell, spot) : '';
          const number = Number(day.slice(8));

          return (
            <button
              key={day}
              type="button"
              className={[
                'daypicker__day',
                open ? 'is-open' : 'is-shut',
                isSelected ? 'is-selected' : '',
                cell?.reason === 'event' ? 'is-event' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!open}
              aria-pressed={isSelected}
              aria-label={
                open
                  ? `${formatDayLong(day)}, available`
                  : `${formatDayLong(day)}, ${note || 'not available'}`
              }
              title={note || undefined}
              onClick={() => onChange(day)}
            >
              <span className="daypicker__num">{number}</span>
              {note ? <span className="daypicker__note">{note}</span> : null}
            </button>
          );
        })}
      </div>

      {month.loading ? <p className="hint">Loading the calendar…</p> : null}

      <p className="daypicker__selected" aria-live="polite">
        {selected ? (
          <>
            Setting up on <b>{formatDayLong(selected)}</b>
          </>
        ) : (
          'Pick a date above.'
        )}
      </p>

      <p className="hint">
        Event dates are greyed out here. Those go through the event signup at the top of this
        page, where the deadline and the waitlist apply.
      </p>
    </div>
  );
}
