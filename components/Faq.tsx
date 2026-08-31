import { faqItems } from '@/lib/seo';

/**
 * Rendered per request rather than from a constant: one answer names the next
 * event, and a hardcoded date outlives the event it names.
 */
export default function Faq() {
  const items = faqItems();

  return (
    <section className="section section--char" id="faq" aria-labelledby="faq-title">
      <div className="shell">
        <p className="eyebrow">Questions</p>
        <h2 id="faq-title">Things people ask us</h2>

        <div className="faq__list">
          {items.map((item) => (
            <details className="faq__item" key={item.q}>
              <summary>{item.q}</summary>
              <div className="faq__answer">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>

        {/* The section used to end into the newsletter signup, so somebody who
            had just read every answer had nothing to do but scroll back up. */}
        <p className="section__cta">
          <a className="btn btn--rust" href="#apply">
            Apply for a spot
          </a>
        </p>
        <p className="hint section__ctahint">
          Takes a couple of minutes. You sign the agreement and pay at the end.
        </p>
      </div>
    </section>
  );
}
