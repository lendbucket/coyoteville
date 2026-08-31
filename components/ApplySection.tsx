'use client';

import { useEffect, useState } from 'react';
import VendorForm from './VendorForm';
import WaitlistForm from './WaitlistForm';
import { isWaitlistForSpot, type EventOption } from '@/lib/event-options';

/**
 * The apply section: either the application form or the waitlist, depending on
 * the event picked.
 *
 * The selection lives here rather than in either form, so switching between an
 * open event and a full one swaps the body without losing which event the
 * vendor was looking at. Both children render the same picker, wired back to
 * this state.
 *
 * Nothing here is a security boundary. Both API routes re-check the event and
 * its deadline server side; this only decides what is worth showing.
 */
export default function ApplySection({
  events,
  defaultSlug,
  supportEmail,
}: {
  /** Published events, oldest first. Closed and full ones included. */
  events: EventOption[];
  /** The soonest still open, or the soonest published when none is. */
  defaultSlug: string;
  supportEmail: string;
}) {
  const [slug, setSlug] = useState(defaultSlug);
  /* The spot type lives here rather than in the form, because intake is capped
     per type and so it is what decides between applying and waiting. Picking a
     type whose queue is full is the moment a vendor stops being an applicant
     and becomes somebody waiting, and that has to be visible the instant they
     pick it rather than after they have filled the whole form in and paid. */
  const [spot, setSpot] = useState<'' | 'booth' | 'truck' | 'free'>('');

  /**
   * Honour ?event= in the URL. The waitlist offer email links straight to the
   * event a vendor was invited to, and landing on the default one instead
   * would quietly send them to the wrong form.
   *
   * Read after mount rather than during render: the server has no query string
   * when it prerenders this, and reading it in the initial state would make the
   * two disagree.
   */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('event');
    if (wanted && events.some((e) => e.slug === wanted)) setSlug(wanted);
  }, [events]);

  const selected = events.find((e) => e.slug === slug) ?? events[0];

  // No published events at all. Nothing to apply for and nothing to wait for.
  if (!selected) {
    return (
      <section className="section apply" id="apply" aria-labelledby="apply-title">
        <div className="shell">
          <p className="eyebrow">Vendor application</p>
          <h2 id="apply-title">No events on the calendar yet</h2>
          <p className="lede muted">
            Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will let you know
            when the next one is announced.
          </p>
        </div>
      </section>
    );
  }

  const { lifecycle } = selected;

  /* The waitlist is for one state only: the signup window is open and the type
     this vendor picked has run out. It used to appear whenever the event was
     not open, which meant a date whose deadline had simply passed offered a
     list nobody would ever be taken off.

     Asked of the type they picked, not of the event. Booths full with trucks
     still going is closed to one vendor and open to the next, and gating both
     on one number turns away every truck because the booths were popular. With
     nothing picked yet there is no answer to give, so the form is shown. */
  if (isWaitlistForSpot(selected, spot)) {
    return (
      <WaitlistForm
        events={events}
        eventSlug={selected.slug}
        onEventChange={setSlug}
        supportEmail={supportEmail}
        spotType={spot}
        onSpotTypeChange={setSpot}
      />
    );
  }

  /* Signup is shut and this is not a waitlist case: the deadline has gone, the
     night is running, or it is over. The form says so rather than pretending to
     take an application the API would refuse. */
  if (!lifecycle.signupWindowOpen) {
    return (
      <VendorForm
        events={events}
        eventSlug={selected.slug}
        onEventChange={setSlug}
        supportEmail={supportEmail}
        spotType={spot}
        onSpotTypeChange={setSpot}
        signupClosed
        closedTitle={
          lifecycle.state === 'LIVE'
            ? `${selected.name} is happening now`
            : `Signup is closed for ${selected.name}`
        }
      />
    );
  }

  return (
    <VendorForm
      events={events}
      eventSlug={selected.slug}
      onEventChange={setSlug}
      supportEmail={supportEmail}
      spotType={spot}
      onSpotTypeChange={setSpot}
    />
  );
}
