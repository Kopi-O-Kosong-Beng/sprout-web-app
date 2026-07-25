import { Link } from 'react-router-dom';
import {
  CactusHero,
  PlantAvatar,
  StatGrid,
  plantAvatars,
} from '../components/common/PlantVisuals';

/** The three steps are a genuine sequence, so they carry plate designations.
 *  They are laid out as a ruled rail rather than three identical cards. */
const METHOD = [
  {
    plate: 'i',
    title: 'Identify',
    body: 'Photograph a plant. Sprout resolves it to a real species — scientific name, family, habitat, conservation status — not a guess and a nice picture.',
  },
  {
    plate: 'ii',
    title: 'Press',
    body: 'The species is rendered once as canonical pixel-art and mounted in your collection. One plate per species, shared across every player who finds it.',
  },
  {
    plate: 'iii',
    title: 'Field-test',
    body: 'Each plate carries stats drawn from its own botany. Take one into a turn-based match against a fixed opponent and the result is written back to your record.',
  },
];

function SpecimenPlate({ index }: { index: number }) {
  const avatar = plantAvatars[index];
  return (
    <article className="specimen-plate">
      <div className="specimen-art">
        <PlantAvatar avatar={avatar} />
      </div>
      <div className="specimen-label">
        <p className="specimen-taxon">{avatar.family}</p>
        <h3>{avatar.species}</h3>
        <p className="specimen-common">{avatar.name}</p>
        <StatGrid avatar={avatar} compact />
      </div>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-stage">
      <section className="hero-grid" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Sprout — Field Guide to Urban Flora</p>
          <h1 id="hero-title">
            A field guide to the plants you <em>walk past</em>.
          </h1>
          <p>
            Sprout identifies a real species from a photograph, presses it into a
            pixel-art plate, and gives it a moveset drawn from its actual
            taxonomy. Your collection is the guide. The guide fights back.
          </p>
          <div className="hero-actions">
            <Link className="primary-cta" to="/signup">
              <span aria-hidden="true">→</span>
              Start a collection
            </Link>
            <Link className="secondary-cta" to="/login">
              I have an account
            </Link>
          </div>
        </div>

        <div className="hero-visual">
          <CactusHero />
          <p className="plate-caption">
            Plate 04 · <i>Carnegiea gigantea</i>
          </p>
        </div>
      </section>

      <section className="method-rail" aria-labelledby="method-title">
        <h2 id="method-title" className="section-title">
          Three steps, one plant.
        </h2>
        <ol className="method-list">
          {METHOD.map((step) => (
            <li key={step.plate}>
              <span className="method-plate" aria-hidden="true">
                {step.plate}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="specimen-section" aria-labelledby="specimens-title">
        <div className="section-head">
          <h2 id="specimens-title" className="section-title">
            It is a real plant identifier wearing a game.
          </h2>
          <p>
            Every entry keeps its botanical record alongside its battle stats.
            The species data is the point; the creature is how you remember it.
          </p>
        </div>
        <div className="specimen-row">
          <SpecimenPlate index={0} />
          <SpecimenPlate index={1} />
          <SpecimenPlate index={2} />
        </div>
      </section>

      <section className="closing-note" aria-labelledby="closing-title">
        <h2 id="closing-title">There is a plant within arm's reach.</h2>
        <Link className="primary-cta" to="/signup">
          <span aria-hidden="true">→</span>
          Open your field guide
        </Link>
      </section>
    </main>
  );
}
