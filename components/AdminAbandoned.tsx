import AdminReminderButton from './AdminReminderButton';

export type AbandonedItem = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  spot_type: string;
  amount: string;
  started: string;
  lastReminderAt: string | null;
  canRemind: boolean;
};

/**
 * Started but not paid.
 *
 * Every unpaid application that reached Square, newest first. This is the list
 * to work before the deadline, so it sits at the top of the tracker and every
 * row carries the two things you actually do with it: call them, or resend
 * their payment link.
 */
export default function AdminAbandoned({ rows }: { rows: AbandonedItem[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="abandoned" aria-labelledby="abandoned-title">
      <h2 id="abandoned-title" className="abandoned__title">
        Started but not paid <span className="abandoned__count">{rows.length}</span>
      </h2>
      <p className="abandoned__note">
        These vendors filled the form and reached checkout but have not paid. Their spots are not
        held.
      </p>

      <ul className="abandoned__list">
        {rows.map((r) => (
          <li className="abandoned__row" key={r.id}>
            <div className="abandoned__who">
              <b>{r.business_name}</b>
              <span>
                {r.contact_name} &middot; {r.spot_type} &middot; {r.amount} &middot; started{' '}
                {r.started}
              </span>
            </div>

            <div className="abandoned__actions">
              <a className="btn btn--ghost btn--sm" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                Call {r.phone}
              </a>

              <AdminReminderButton
                id={r.id}
                lastReminderAt={r.lastReminderAt}
                canRemind={r.canRemind}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
