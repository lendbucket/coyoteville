import StringLights from './StringLights';

/**
 * Mission statement.
 *
 * The body is the owner's own wording and is reproduced exactly. It is broken
 * into paragraphs for reading, but no word is changed. Do not edit it for
 * rhythm or length.
 *
 * This was a two column section with a set of summary pills alongside. The
 * pills are gone: this copy already states the free organisation spots, the
 * local priority and the no percentage rule, and repeating them beside the
 * paragraphs read like an advert next to a statement.
 */
export default function Mission() {
  return (
    <section className="mission" id="mission" aria-labelledby="mission-title">
      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={7} id="mission-lights" />

      <div className="shell mission__in">
        <p className="eyebrow">About</p>
        <h2 id="mission-title">Why we built Coyoteville</h2>

        <div className="mission__body">
          <p>
            Alice built a new stadium and there was nowhere to gather around it. We bought the
            vacant lot across the street and turned it into a place where families can eat, hear
            live music, and spend time together before and after the game.
          </p>
          <p>
            Every vendor here is a local business. Alice and Jim Wells County vendors get first
            priority on every spot, and we take no percentage of what anyone earns.
          </p>
          <p>
            Alice organizations set up free, permanently. That includes band, colorguard,
            athletics, clubs, and church groups.
          </p>
          <p>
            We are not here to take anything from anyone. We are one more option on a Friday
            night, and we would rather this town spend that money in Alice than an hour away in
            Corpus Christi.
          </p>
        </div>
      </div>
    </section>
  );
}
