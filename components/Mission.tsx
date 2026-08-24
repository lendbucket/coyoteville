import StringLights from './StringLights';

const PILLS = [
  {
    title: 'Free spots for Alice organizations',
    body: 'Band, colorguard, sports, clubs, churches. Free space, and you keep every dollar you raise, always.',
  },
  {
    title: 'No cut of your sales',
    body: 'A flat rate per event and that is it. We never take a percentage of what a vendor makes.',
  },
  {
    title: 'Local first',
    body: 'Alice and Jim Wells County businesses get first call on every spot.',
  },
  {
    title: 'Family friendly, always',
    body: 'Room to sit, room for the kids, all ages welcome, every single event.',
  },
];

export default function Mission() {
  return (
    <section className="mission" id="mission" aria-labelledby="mission-title">
      <StringLights tone="dark" variant="top" swags={5} sag={30} bulbsPerSwag={7} id="mission-lights" />

      <div className="shell mission__in">
        <div className="mission__cols">
          <div>
            <p className="eyebrow">Why we built this</p>
            <h2 id="mission-title">We bought a vacant lot and gave the town somewhere to go</h2>

            <p>
              Alice has a brand new stadium and nowhere to gather around it. So we bought the
              empty lot across the street and started building a place where families can eat,
              listen to music and hang out on a Friday night without driving to Corpus.
            </p>
            <p>
              Every truck and every booth out here belongs to somebody from around here. Local
              kitchens, local crafters, local families building something of their own. When you
              buy a plate at Coyoteville, that money stays in Alice.
            </p>
            <p>
              We are not competing with anybody. We are adding one more reason for this town to
              show up.
            </p>
          </div>

          <ul className="mission__pills">
            {PILLS.map((pill) => (
              <li className="pill" key={pill.title}>
                <b>{pill.title}</b>
                <span>{pill.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
