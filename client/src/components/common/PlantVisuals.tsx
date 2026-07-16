/** Shared illustrative visuals + sample data from the static design draft.
 *  The plantAvatars list is showcase data for the still-static Archive/Battle
 *  pages — the real archive will read GET /api/avatar in a later slice.
 */

export interface PlantAvatarData {
  id: string;
  name: string;
  species: string;
  family: string;
  discovered: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  color: string;
}

export const plantAvatars: PlantAvatarData[] = [
  {
    id: 'monstera',
    name: 'Monstera Scout',
    species: 'Monstera deliciosa',
    family: 'Araceae',
    discovered: '12 Jul 2026',
    hp: 148,
    attack: 62,
    defense: 74,
    speed: 48,
    color: 'emerald',
  },
  {
    id: 'orchid',
    name: 'Orchid Flare',
    species: 'Phalaenopsis aphrodite',
    family: 'Orchidaceae',
    discovered: '10 Jul 2026',
    hp: 96,
    attack: 86,
    defense: 42,
    speed: 81,
    color: 'violet',
  },
  {
    id: 'fern',
    name: 'Fern Ward',
    species: 'Nephrolepis exaltata',
    family: 'Nephrolepidaceae',
    discovered: '08 Jul 2026',
    hp: 132,
    attack: 54,
    defense: 88,
    speed: 57,
    color: 'sage',
  },
  {
    id: 'cactus',
    name: 'Cactus Guard',
    species: 'Echinopsis chamaecereus',
    family: 'Cactaceae',
    discovered: '06 Jul 2026',
    hp: 168,
    attack: 58,
    defense: 92,
    speed: 34,
    color: 'lime',
  },
  {
    id: 'mushroom',
    name: 'Mycelium Hex',
    species: 'Agaricus bisporus',
    family: 'Agaricaceae',
    discovered: '04 Jul 2026',
    hp: 88,
    attack: 92,
    defense: 38,
    speed: 64,
    color: 'clay',
  },
];

export function PlantAvatar({
  avatar,
  large = false,
}: {
  avatar: PlantAvatarData;
  large?: boolean;
}) {
  return (
    <span className={large ? `plant-avatar ${avatar.color} large` : `plant-avatar ${avatar.color}`}>
      <span className="leaf left" />
      <span className="leaf right" />
      <span className="face">
        <span />
        <span />
      </span>
      <span className="pot" />
    </span>
  );
}

export function BotAvatar() {
  return (
    <span className="bot-avatar">
      <span className="thorn left" />
      <span className="thorn right" />
      <span className="bot-eyes" />
      <span className="pot" />
    </span>
  );
}

export function CactusHero() {
  return (
    <div className="cactus-hero" aria-hidden="true">
      <span className="arm arm-left" />
      <span className="arm arm-right" />
      <span className="cactus-body">
        <i />
        <i />
        <i />
      </span>
      <span className="cactus-face" />
      <span className="hero-pot" />
    </div>
  );
}

export function SproutMark() {
  return (
    <span className="sprout-mark" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function MiniArchive() {
  return (
    <div className="mini-archive" aria-hidden="true">
      {plantAvatars.slice(0, 3).map((avatar) => (
        <PlantAvatar key={avatar.id} avatar={avatar} />
      ))}
    </div>
  );
}

export function StatGrid({
  avatar,
  compact = false,
}: {
  avatar: PlantAvatarData;
  compact?: boolean;
}) {
  return (
    <dl className={compact ? 'stat-grid compact-stats' : 'stat-grid'}>
      <div>
        <dt>HP</dt>
        <dd>{avatar.hp}</dd>
      </div>
      <div>
        <dt>ATK</dt>
        <dd>{avatar.attack}</dd>
      </div>
      <div>
        <dt>DEF</dt>
        <dd>{avatar.defense}</dd>
      </div>
      <div>
        <dt>SPD</dt>
        <dd>{avatar.speed}</dd>
      </div>
    </dl>
  );
}

export function HealthBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="health-meter" aria-label={`${label} ${value} percent`}>
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}
