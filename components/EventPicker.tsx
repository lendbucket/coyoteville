'use client';

import type { EventOption } from '@/lib/event-options';

/**
 * Which event a vendor is signing up for.
 *
 * One control shared by the application form and the waitlist form, so
 * switching between them cannot lose the selection or renumber the options.
 * Closed and full events stay in the list on purpose: they are exactly the
 * ones you join a waitlist for, and hiding them would leave a vendor unable to
 * ask about the event they actually want.
 *
 * The status is in the option text rather than in a disabled attribute,
 * because a native select on a phone gives no explanation for a greyed out row.
 */
export default function EventPicker({
  id,
  events,
  value,
  onChange,
  /** Posts with the form. Off when the picker sits outside a form. */
  name = 'event_slug',
}: {
  id: string;
  events: EventOption[];
  value: string;
  onChange: (slug: string) => void;
  name?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        Which event <span className="req">*</span>
      </label>
      <select
        className="select"
        id={id}
        name={name}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {events.map((event) => (
          <option key={event.slug} value={event.slug}>
            {event.name}, {event.displayDate}
            {event.isFull === true ? ' — full' : event.deadlinePassed ? ' — closed' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
