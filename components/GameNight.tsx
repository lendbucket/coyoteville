import { GAME_NIGHT } from '@/lib/seo';

/**
 * Game night logistics. Admission and parking.
 *
 * The facts come from lib/seo so this section, the FAQ and the FAQPage schema
 * all state the same thing. People search for the parking price, so it needs to
 * be identical wherever it appears.
 */
export default function GameNight() {
  return (
    <section className="section gamenight" id="game-night" aria-labelledby="gamenight-title">
      <div className="shell">
        <p className="eyebrow">Game night</p>
        <h2 id="gamenight-title">Eat here, then head to the game</h2>

        <ul className="gamenight__list">
          {GAME_NIGHT.map((item) => (
            <li className="gamenight__item" key={item.label}>
              <span className="gamenight__label">{item.label}</span>
              <p className="gamenight__body">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
