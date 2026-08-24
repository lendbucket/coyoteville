import StringLights from './StringLights';
import {
  NEXT_STEPS_CONTACT,
  NEXT_STEPS_HEADING,
  NEXT_STEPS_SHARED,
  nextStepsFor,
} from '@/lib/next-steps';

/**
 * What happens next, on the site.
 *
 * Reads the same config as the confirmation email. No hooks and no server only
 * import, so it works from the confirmed page and from inside the client side
 * vendor form once a submission succeeds.
 */
export default function NextSteps({
  spot,
  id = 'next-steps',
}: {
  /** 'booth' | 'truck' | 'free', or anything else when the type is unknown. */
  spot?: string;
  /** Unique per instance, so two on a page cannot collide on gradient ids. */
  id?: string;
}) {
  const block = nextStepsFor(spot);

  return (
    <section className="nextsteps" aria-labelledby={`${id}-title`}>
      <StringLights tone="dark" variant="top" swags={5} sag={28} bulbsPerSwag={7} id={`${id}-lights`} />

      <div className="shell nextsteps__in">
        <h2 id={`${id}-title`} className="nextsteps__title">
          {NEXT_STEPS_HEADING}
        </h2>

        <ul className="nextsteps__list">
          {NEXT_STEPS_SHARED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {block ? (
          <div className="nextsteps__block">
            <h3 className="nextsteps__subhead">{block.heading}</h3>
            <ul className="nextsteps__list">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="nextsteps__note">
            The notes for your spot type are in your confirmation email.
          </p>
        )}

        <p className="nextsteps__contact">{NEXT_STEPS_CONTACT}</p>
      </div>
    </section>
  );
}
