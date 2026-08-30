import StringLights from './StringLights';
import { MONTHLY_PRICING } from '@/lib/booking';
import { PRICING } from '@/lib/seo';

/**
 * The permanent monthly spot.
 *
 * Written the way the rest of the site talks: plain, specific, and it says the
 * number out loud rather than dancing around it. Every benefit here is a thing
 * that actually happens, not an adjective. "Featured on the site with your logo
 * and a link" is checkable. "Maximum exposure" is not, and it is the kind of
 * line that makes a local business stop believing the rest of the page.
 *
 * The maths is on the page on purpose. A truck at $600 is twelve nights at the
 * ordinary rate, and there are far more than twelve nights in a month, so
 * anybody who turns up regularly is better off. Saying so is more persuasive
 * than any amount of describing the value, and it is the argument the owner
 * would make standing in the lot.
 */

const BENEFITS: { title: string; body: string }[] = [
  {
    title: 'Your space, held every day',
    body:
      'The same spot, reserved for you, every day we are open. You do not book, you do not check whether there is room, and you do not lose your place to somebody who applied earlier that week. Turn up and set up.',
  },
  {
    title: 'Every event included',
    body:
      'Every event we run that month is included at no extra charge. Game nights, the ones that fill the lot, the ones people plan their Friday around. You are already in.',
  },
  {
    title: 'First pick of the lot',
    body:
      'Permanent vendors choose their placement before anyone else, and keep it. If you want the corner by the entrance where the line forms, that conversation happens once.',
  },
  {
    title: 'Event dates before they open',
    body:
      'You get the new dates before they go on the site. By the time everyone else sees the calendar, your spots are already yours.',
  },
  {
    title: 'Posted every day we are open',
    body:
      'You go out on our social channels daily, not once when you sign up. Your name, your food, your photos, in front of the people who are deciding where to eat that night.',
  },
  {
    title: 'On the site, with your link',
    body:
      'A featured slot on this website carrying your logo, your photos and a link straight to you. Somebody looking up the park finds your business, not just ours.',
  },
];

export default function PermanentSpot({ id = 'permanent' }: { id?: string }) {
  return (
    <section className="permanent" id={id} aria-labelledby={`${id}-title`}>
      <StringLights tone="dark" variant="top" swags={5} sag={28} bulbsPerSwag={7} id={`${id}-lights`} />

      <div className="shell permanent__in">
        <p className="eyebrow">Permanent spots</p>
        <h2 id={`${id}-title`}>Keep your spot all month</h2>

        <p className="lede muted">
          Most vendors book one night at a time. A few want to be here properly, so we hold a space
          for them every single day we are open and put them in front of the whole town while we
          are at it.
        </p>

        <div className="permanent__prices">
          <div className="permanent__price">
            <span className="permanent__amount">{MONTHLY_PRICING.truck.price}</span>
            <span className="permanent__per">a month, food truck</span>
            <span className="permanent__maths">
              Twelve nights at {PRICING.truck.price} and you have covered it. There are a lot more
              than twelve nights in a month.
            </span>
          </div>
          <div className="permanent__price">
            <span className="permanent__amount">{MONTHLY_PRICING.booth.price}</span>
            <span className="permanent__per">a month, vendor booth</span>
            <span className="permanent__maths">
              Fourteen days at {PRICING.booth.price} and you are even. Everything after that is
              yours.
            </span>
          </div>
        </div>

        <ul className="permanent__list">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title}>
              <h3>{benefit.title}</h3>
              <p>{benefit.body}</p>
            </li>
          ))}
        </ul>

        <div className="permanent__terms">
          <p>
            <b>How the billing works.</b> Your card is charged the month we approve you, then the
            same amount on the same date every month after that. Nothing is taken while your
            application is being reviewed, and if we cannot fit you in your card is released
            without ever being charged.
          </p>
          <p>
            <b>Cancel whenever you want.</b> One email or one phone call. There is no notice period
            and no fee. Cancelling stops the next charge and you keep your spot to the end of the
            month you have already paid for. We do not refund part of a month, and we do not think
            you should have to argue with anyone to leave.
          </p>
        </div>

        <p className="permanent__cta">
          <a className="btn btn--rust" href="#apply">
            Apply for a permanent spot
          </a>
        </p>
        <p className="hint permanent__hint">
          Pick <b>Permanent monthly spot</b> at the top of the application form.
        </p>
      </div>
    </section>
  );
}
