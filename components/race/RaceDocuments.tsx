import { RACE_WAIVER, RACE_WAIVER_IS_DRAFT, RACE_WAIVER_VERSION } from '@/lib/race-waiver/current';

/**
 * The three documents, rendered by the server and never by the browser.
 *
 * This is deliberately NOT a client component and is deliberately not a child
 * or a prop of one. It lived inside RaceRegistration, which owns the form state
 * and therefore carries a 'use client' boundary, and everything a client
 * component imports is serialized into the bundle: the whole forty thousand
 * character instrument was crossing into the browser as JavaScript and taking
 * /turkey-trot from 9.49 kB of page JS to 21.6 kB.
 *
 * The text is static. It has no state, no handlers, and nothing re-renders it,
 * so it belongs in the HTML. Passing it to the client component as children or
 * as a prop would not have fixed anything either: that serializes the rendered
 * output into the flight payload instead of the source into the bundle, which
 * is the same bytes arriving by a different road.
 *
 * So it is a sibling. The signing block is a small island elsewhere on the page
 * that owns the checkboxes, the typed name and the button, and the two are
 * joined by anchors rather than by shared state: each acknowledgment links to
 * the id of the document it covers.
 */
export default function RaceDocuments() {
  return (
    <div className="racedocs">
      {RACE_WAIVER_IS_DRAFT ? (
        <p className="formnote formnote--error">
          This waiver is a draft and has not been reviewed by a lawyer yet. It is on the page so
          you can read exactly what you are being asked to sign.
        </p>
      ) : null}

      {/* Scrollable rather than endless, so the button below the form is
          reachable without scrolling past fourteen pages of text. */}
      <div className="racedocs__scroll" tabIndex={0} role="region" aria-label="The documents you are signing">
        {RACE_WAIVER.map((block, i) => {
          /* race-v1.0-2026 is three documents in one instrument, and a
             'document' block starts one. Each gets a title and an anchor so an
             acknowledgment can link to the text it covers. */
          if (block.kind === 'document') {
            return (
              <h3 key={i} id={`waiver-${block.id ?? i}`} className="racedocs__title">
                {block.text}
              </h3>
            );
          }

          if (block.kind === 'heading') {
            return (
              <h4 key={i} className="racedocs__h">
                {block.text}
              </h4>
            );
          }

          /* Article 2.2 recites that the release and indemnity provisions are
             set in capital letters so as to be conspicuous. Their case comes
             from the document; this class is what sets them apart on screen,
             which is the half of conspicuousness the rendering owns. */
          if (block.kind === 'conspicuous') {
            return (
              <p key={i} className="racedocs__conspicuous">
                {block.text}
              </p>
            );
          }

          if (block.kind === 'list') {
            return (
              <ol key={i} className="racedocs__list">
                {(block.items ?? []).map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ol>
            );
          }

          return <p key={i}>{block.text}</p>;
        })}
      </div>

      <p className="racedocs__version">
        Version {RACE_WAIVER_VERSION}. Executed electronically under Article 14.2.
      </p>

      {/* Article 14.4, in the document's own terms. It is a right the document
          grants and the page said nothing about it. */}
      <p className="racedocs__paper">
        Participant may obtain a paper copy of this Agreement at no charge by written request to
        the Organizer through the contact information published at coyoteville.com, and may
        withdraw consent to electronic records before signing by declining to register online and
        signing a paper form at packet pickup.
      </p>
    </div>
  );
}
