const STEPS = [
  {
    n: '01',
    title: 'Pick your spot',
    body: 'Booth, food truck, or a free Coyote organization spot. Tell us what you sell.',
  },
  {
    n: '02',
    title: 'Upload your stuff',
    body: 'Your logo and a few photos so we can spotlight you, plus your food handler permit if you serve food.',
  },
  {
    n: '03',
    title: 'Sign the agreement',
    body: 'Read it, type your name, done. The version you signed is saved with your record.',
  },
  {
    n: '04',
    title: 'Pay and you are set',
    body: 'Secure Square checkout. We confirm your spot and send the setup details.',
  },
];

export default function HowItWorks() {
  return (
    <section className="section steps" id="how" aria-labelledby="how-title">
      <div className="shell">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title">Four steps and you are in</h2>

        <ol className="steps__grid">
          {STEPS.map((step) => (
            <li className="step" key={step.n}>
              <b aria-hidden="true">{step.n}</b>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
