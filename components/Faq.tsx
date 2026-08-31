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
      </div>
    </section>
  );
}
