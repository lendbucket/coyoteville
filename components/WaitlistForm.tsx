'use client';

import { useId, useState } from 'react';
import EventPicker from './EventPicker';
import StringLights from './StringLights';
import { PRICING } from '@/lib/seo';
import { closedReason, type EventOption } from '@/lib/event-options';

/**
 * The waitlist.
 *
 * Shown instead of the application form when the chosen event is full or its
 * deadline has gone. Short on purpose: six fields, no agreement, no uploads and
 * no payment, because none of that means anything until a spot actually opens.
 *
 * The wording does a lot of work here. Someone filling this in has just been
 * told they cannot have what they came for, and the one thing that must not
 * happen is them believing they have a spot. So it says waitlist, not spot, in
 * the heading, the intro, the button and the confirmation.
 */

type Status = 'idle' | 'sending' | 'done' | 'error';

export default function WaitlistForm({
  events,
  eventSlug,
  onEventChange,
  supportEmail,
}: {
  events: EventOption[];
  eventSlug: string;
  onEventChange: (slug: string) => void;
  supportEmail: string;
}) {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [position, setPosition] = useState<number | null>(null);
  const [alreadyOn, setAlreadyOn] = useState(false);

  const event = events.find((e) => e.slug === eventSlug) ?? events[0];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    const form = new FormData(e.currentTarget);
    setStatus('sending');
    setMessage('');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_slug: form.get('event_slug'),
          business_name: form.get('business_name'),
          contact_name: form.get('contact_name'),
          phone: form.get('phone'),
          email: form.get('email'),
          spot_type: form.get('spot_type'),
          sells: form.get('sells'),
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        position?: number;
        alreadyOn?: boolean;
      };

      if (!response.ok || !data.ok) {
        setStatus('error');
        setMessage(data.error ?? 'That did not go through. Try again in a minute.');
        return;
      }

      setPosition(data.position ?? null);
      setAlreadyOn(Boolean(data.alreadyOn));
      setStatus('done');
    } catch {
      setStatus('error');
      setMessage('That did not go through. Check your connection and try again.');
    }
  }

  if (status === 'done') {
    return (
      <section className="section apply" id="apply" aria-labelledby="apply-title">
        <StringLights tone="dark" variant="top" swags={5} sag={30} id="apply-lights-waitlist-done" />
        <div className="shell">
          <p className="eyebrow">Waitlist</p>
          <h2 id="apply-title">
            {alreadyOn ? 'You were already on the list' : 'You are on the waitlist'}
          </h2>
          <p className="lede muted">
            {position !== null ? (
              <>
                You are number <b>{position}</b> for {event?.name}. We sent a confirmation to your
                email.
              </>
            ) : (
              <>We have you down for {event?.name}. We sent a confirmation to your email.</>
            )}
          </p>
          <p className="hint">
            This is a waitlist, not a confirmed spot. Nothing has been charged. If a spot opens we
            work down the list in order and email you a link to register and pay.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="section apply" id="apply" aria-labelledby="apply-title">
      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={6} id="apply-lights-waitlist" />

      <div className="shell">
        <p className="eyebrow">Waitlist</p>
        <h2 id="apply-title">Join the waitlist</h2>

        <p className="lede muted">
          {event ? closedReason(event) : 'This event is not taking applications.'} Put your name
          down and we will contact you if a spot opens.
        </p>

        <p className="formnote formnote--warn" role="note">
          <b>This is a waitlist, not a confirmed spot.</b> No payment is taken now and no space is
          held. If someone cancels or we open more room, we work down the list in order and email
          you a link to register and pay.
        </p>

        <form className="form" onSubmit={onSubmit} noValidate={false}>
          <div className="grid2">
            <EventPicker
              id={`${uid}-event`}
              events={events}
              value={eventSlug}
              onChange={onEventChange}
            />

            <div className="field">
              <label className="label" htmlFor={`${uid}-spot`}>
                Spot you want <span className="req">*</span>
              </label>
              <select className="select" id={`${uid}-spot`} name="spot_type" required defaultValue="">
                <option value="" disabled>
                  Pick one
                </option>
                <option value="booth">
                  {PRICING.booth.label}, {PRICING.booth.price}
                </option>
                <option value="truck">
                  {PRICING.truck.label}, {PRICING.truck.price}
                </option>
                <option value="free">{PRICING.free.label}, free</option>
              </select>
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label className="label" htmlFor={`${uid}-business`}>
                Business name <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-business`}
                name="business_name"
                type="text"
                required
                maxLength={120}
                autoComplete="organization"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-contact`}>
                Your name <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-contact`}
                name="contact_name"
                type="text"
                required
                maxLength={120}
                autoComplete="name"
              />
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label className="label" htmlFor={`${uid}-phone`}>
                Phone <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-phone`}
                name="phone"
                type="tel"
                required
                maxLength={40}
                autoComplete="tel"
                inputMode="tel"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor={`${uid}-email`}>
                Email <span className="req">*</span>
              </label>
              <input
                className="input"
                id={`${uid}-email`}
                name="email"
                type="email"
                required
                maxLength={180}
                autoComplete="email"
                inputMode="email"
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor={`${uid}-sells`}>
              What do you sell <span className="req">*</span>
            </label>
            <input
              className="input"
              id={`${uid}-sells`}
              name="sells"
              type="text"
              required
              maxLength={300}
              placeholder="Barbacoa, kettle corn, handmade jewelry"
            />
          </div>

          {status === 'error' ? (
            <p className="formnote formnote--error" role="alert">
              {message}
            </p>
          ) : null}

          <button className="btn btn--amber btn--lg" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Adding you…' : 'Join the waitlist'}
          </button>

          {/* Chips rather than links inside a sentence. Inline text is a small
              target on a phone, and this is the row someone taps when they have
              a question about a spot they did not get. */}
          <p className="hint">Questions before you wait?</p>
          <div className="wl__links">
            <a className="wl__link" href="tel:5404479432">
              540 447 9432
            </a>
            <a className="wl__link" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          </div>
        </form>
      </div>
    </section>
  );
}
