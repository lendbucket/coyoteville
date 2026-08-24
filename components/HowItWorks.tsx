const STEPS = [
  {
    n: '01',
    title: 'Pick your spot',
    body: 'Booth, food truck, or a free Alice organization spot. Tell us what you sell.',
  },
  {
    n: '02',
    title: 'Upload your stuff',
    body: 'Your logo and up to three photos. If you serve food, upload your food handler permit here too.',
  },
  {
    n: '03',
    title: 'Sign the agreement',
    body: 'Read the Vendor Participation Agreement and type your name to sign. The version you signed is saved with your application.',
  },
  {
    n: '04',
    title: 'Pay and you are set',
    body: 'Checkout runs through Square. We confirm your spot by email and send setup details before the event.',
  },
];

export default function HowItWorks() {
  return (
    <section className="section steps" id="how" aria-labelledby="how-title">
      <div className="shell">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title">How to sign up</h2>

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
