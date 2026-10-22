/**
 * The sunset stripe band from the logo, as a divider between sections.
 *
 * Five bars, 8px tall, straight out of the palette. Decorative and nothing
 * more, so it is hidden from assistive technology rather than announced as a
 * row of empty elements.
 */
export default function StripeBand() {
  return <div className="stripeband" aria-hidden="true" />;
}
