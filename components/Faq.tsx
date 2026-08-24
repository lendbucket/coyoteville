import { FAQ } from '@/lib/seo';

export default function Faq() {
  return (
    <section className="section section--char" id="faq" aria-labelledby="faq-title">
      <div className="shell">
        <p className="eyebrow">Questions</p>
        <h2 id="faq-title">Things people ask us</h2>

        <div className="faq__list">
          {FAQ.map((item) => (
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
