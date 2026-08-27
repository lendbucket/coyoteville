import AdminWaitlistRow from './AdminWaitlistRow';
import { PRICING } from '@/lib/seo';
import type { WaitlistEntry } from '@/lib/waitlist';

/**
 * The waitlist for one event, in the tracker.
 *
 * In queue order, because that is the promise made to everyone on it: we work
 * down the list. Contact details are on the row rather than behind a tap,
 * since the whole point is being able to ring someone from the gate.
 *
 * Scoped to whichever event the tracker filter is on, like everything else on
 * the page.
 */

function spotLabel(spot: string): string {
  if (spot === 'truck') return PRICING.truck.label;
  if (spot === 'booth') return PRICING.booth.label;
  return PRICING.free.label;
}

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  waiting: 'Waiting',
  offered: 'Offered',
  converted: 'Registered',
  declined: 'Declined',
};

export default function AdminWaitlist({
  entries,
  eventName,
}: {
  entries: WaitlistEntry[];
  eventName: string;
}) {
  if (!entries.length) return null;

  const waiting = entries.filter((e) => e.status === 'waiting').length;

  return (
    <section className="wl" aria-labelledby="wl-title">
      <div className="wl__head">
        <h2 className="wl__title" id="wl-title">
          Waitlist
        </h2>
        <p className="wl__count">
          {waiting} waiting &middot; {entries.length} total &middot; {eventName}
        </p>
      </div>

      <ol className="wl__list">
        {entries.map((e) => (
          <li className={`wl__row wl__row--${e.status}`} key={e.id}>
            <div className="wl__main">
              <div className="wl__lead">
                <span className="wl__pos" aria-label={`Position ${e.position}`}>
                  {e.position}
                </span>
                <div className="wl__who">
                  <h3 className="wl__biz">{e.business_name}</h3>
                  <p className="wl__contact">{e.contact_name}</p>
                </div>
              </div>

              <div className="wl__tags">
                <span className={`tag tag--${e.spot_type}`}>{spotLabel(e.spot_type)}</span>
                <span className={`tag ${e.status === 'waiting' ? 'tag--warn' : 'tag--ok'}`}>
                  {STATUS_LABEL[e.status] ?? e.status}
                  {e.offered_at ? ` ${when(e.offered_at)}` : ''}
                </span>
              </div>
            </div>

            <p className="wl__sells">{e.sells}</p>

            {/* Both are real links, sized as buttons: this gets used standing
                in the lot with a phone in one hand. */}
            <div className="wl__links">
              <a className="wl__link" href={`tel:${e.phone.replace(/[^\d+]/g, '')}`}>
                {e.phone}
              </a>
              <a className="wl__link" href={`mailto:${e.email}`}>
                {e.email}
              </a>
            </div>

            {e.status === 'converted' || e.status === 'declined' ? null : (
              <AdminWaitlistRow
                id={e.id}
                businessName={e.business_name}
                alreadyOffered={e.status === 'offered'}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
