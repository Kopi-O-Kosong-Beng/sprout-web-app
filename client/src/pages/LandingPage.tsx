import { CactusHero, PlantAvatar, plantAvatars } from '../components/common/PlantVisuals';

function FeatureCard({ title, metric, tone }: { title: string; metric: string; tone: string }) {
  return (
    <article className={`feature-card ${tone}`}>
      <PlantAvatar avatar={plantAvatars[tone === 'sage' ? 0 : 3]} />
      <div>
        <span>{metric}</span>
        <h2>{title}</h2>
      </div>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-stage">
      <section className="hero-grid" aria-labelledby="hero-title">
        <div className="hero-visual">
          <CactusHero />
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Scan. Grow. Battle.</p>
          <h1 id="hero-title">
            Discover <span>Plant</span> Avatars For Your Archive
          </h1>
          <p>
            Sprout turns real plant discovery into a nature-learning game with
            avatar collections, AI sprite generation, and PVE battles.
          </p>
        </div>

        <div className="product-rail" aria-label="Featured platform modules">
          <FeatureCard title="Avatar Archive" metric="5 seeded" tone="sage" />
          <FeatureCard title="Battle Ready" metric="PVE bot" tone="lime" />
        </div>
      </section>
    </main>
  );
}
