import { NEXT_EVENT } from '@/lib/seo';

export default function EventBar() {
  return (
    <aside className="eventbar" aria-label="Next event">
      <div className="shell eventbar__inner">
        <span className="eventbar__tag">Next event</span>
        <span className="eventbar__name">{NEXT_EVENT.name}</span>
        <span className="eventbar__when">
          <time dateTime={NEXT_EVENT.startISO}>
            {NEXT_EVENT.displayDate} at {NEXT_EVENT.displayTime}
          </time>
        </span>
        <a className="eventbar__link" href="#apply">
          Get a spot
        </a>
      </div>
    </aside>
  );
}
