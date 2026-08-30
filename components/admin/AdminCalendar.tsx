'use client';

import { useMemo, useState } from 'react';
import { formatDayLong, formatDayShort } from '@/lib/booking';

/**
 * Who is booked on which day.
 *
 * A list of days rather than a month grid, which is the opposite of the choice
 * the vendor facing picker makes, and deliberately so. A vendor is asking "is
 * the fourteenth free", which a grid answers at a glance. Whoever is running
 * the lot is asking "who is turning up and when", which is a list, and a
 * seven column grid on a phone has no room to put a name in.
 *
 * Days with nobody on them are not drawn. An empty Tuesday is not information;
 * the next day that has somebody on it is.
 */

export type CalendarBooking = {
  id: string;
  day: string;
  businessName: string;
  contactName: string;
  phone: string;
  spotType: string;
  spotTypeLabel: string;
  spotNumber: string | null;
  approvalStatus: string;
  paymentStatus: string;
};

export type CalendarMonthly = {
  id: string;
  businessName: string;
  spotTypeLabel: string;
  spotNumber: string | null;
  subscriptionStatus: string | null;
};

export default function AdminCalendar({
  bookings,
  monthly,
  onOpen,
}: {
  bookings: CalendarBooking[];
  /** Permanent vendors, who are on every one of these days by definition. */
  monthly: CalendarMonthly[];
  onOpen: (id: string) => void;
}) {
  const [showPast, setShowPast] = useState(false);

  const days = useMemo(() => {
    const grouped = new Map<string, CalendarBooking[]>();
    for (const booking of bookings) {
      const list = grouped.get(booking.day);
      if (list) list.push(booking);
      else grouped.set(booking.day, [booking]);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [bookings]);

  // Compared as strings. Both sides are YYYY-MM-DD, which sorts correctly as
  // text, and it keeps a timezone out of a question that does not need one.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = days.filter(([day]) => day >= today);
  const past = days.filter(([day]) => day < today);
  const shown = showPast ? days : upcoming;

  return (
    <div className="acal">
      {monthly.length ? (
        <div className="acal__monthly">
          <p className="acal__monthlyhd">On every day, permanently</p>
          <ul>
            {monthly.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onOpen(m.id)}>
                  <span className="acal__name">{m.businessName}</span>
                  <span className="badge badge--spot">{m.spotTypeLabel}</span>
                  {m.spotNumber ? <span className="badge badge--spot">Spot {m.spotNumber}</span> : null}
                  {m.subscriptionStatus === 'past_due' ? (
                    <span className="badge badge--review">Payment failed</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="ash__empty">
          Nobody has booked an ordinary day yet.
          {past.length ? ' There are past bookings below.' : ''}
        </p>
      ) : (
        <ul className="acal__days">
          {shown.map(([day, list]) => (
            <li key={day} className={day < today ? 'acal__day is-past' : 'acal__day'}>
              <p className="acal__date">
                <span className="acal__long">{formatDayLong(day)}</span>
                <span className="acal__short">{formatDayShort(day)}</span>
                <span className="acal__count">
                  {list.length} {list.length === 1 ? 'vendor' : 'vendors'}
                </span>
              </p>

              <ul className="acal__vendors">
                {list.map((booking) => (
                  <li key={booking.id}>
                    <button type="button" onClick={() => onOpen(booking.id)}>
                      <span className="acal__name">{booking.businessName}</span>
                      <span className={`badge badge--${booking.spotType}`}>
                        {booking.spotTypeLabel}
                      </span>
                      {booking.spotNumber ? (
                        <span className="badge badge--spot">Spot {booking.spotNumber}</span>
                      ) : null}
                      {booking.approvalStatus === 'pending' ? (
                        <span className="badge badge--review">Needs review</span>
                      ) : booking.approvalStatus === 'denied' ? (
                        <span className="badge badge--off">Denied</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {past.length ? (
        <button className="btn btn--ghost acal__past" type="button" onClick={() => setShowPast((v) => !v)}>
          {showPast ? 'Hide past days' : `Show ${past.length} past ${past.length === 1 ? 'day' : 'days'}`}
        </button>
      ) : null}
    </div>
  );
}
