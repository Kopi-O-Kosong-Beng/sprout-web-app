/**
 * Shared plant visuals.
 *
 * These used to be CSS-art — layered spans drawing a leaf, a face and a pot.
 * The pixel-art system ships the real painted assets the Android game used, so
 * each avatar is now the genuine composite the garden screens draw: the empty
 * pot from `/img/ic_pot_empty.png` with the plant's 192×192 sprite standing in
 * it. When a record has no sprite yet the pot renders on its own, which is what
 * an empty slot on the shelf looks like anyway.
 *
 * The exported surface is unchanged — `PlantAvatarData`, the role="img"
 * wrappers and their aria-labels are what the archive, battle and presentation
 * layers are written against.
 */
import { useState } from 'react';

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
  spriteUrl?: string;
  /** The photograph the sprite was drawn from, when the record carries one. */
  photoUrl?: string;
  /** 'mobile' is an IRL camera scan and is kept; 'web' is an upload, 24h TTL. */
  source?: 'mobile' | 'web';
  /** When a web upload runs out, ISO-8601. Null on anything that is kept. */
  expiresAt?: string | null;
  /** False once a temporary record has expired — the server's own verdict. */
  battleEligible?: boolean;
  isDemo?: boolean;
  /** UC4 detail fields; optional because older records may not carry them. */
  habitat?: string;
  /** Plant.id's prose. Held whole; shortened at the point of display. */
  description?: string;
  conservationStatus?: string;
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

/** The pot, and the sprite standing in it when there is one. */
function PottedSprite({
  spriteUrl,
  wiggle = false,
}: {
  spriteUrl?: string;
  wiggle?: boolean;
}) {
  const [failedSpriteUrl, setFailedSpriteUrl] = useState<string | null>(null);
  const trimmed = spriteUrl?.trim();
  const showSprite = Boolean(trimmed && trimmed !== failedSpriteUrl);

  return (
    <>
      <img className="pot-art" src="/img/ic_pot_empty.png" alt="" draggable={false} />
      {showSprite && (
        <img
          className={wiggle ? 'plant-sprite wiggle' : 'plant-sprite'}
          src={trimmed}
          alt=""
          draggable={false}
          onError={() => setFailedSpriteUrl(trimmed ?? null)}
        />
      )}
    </>
  );
}

export function PlantAvatar({
  avatar,
  large = false,
  wiggle = false,
}: {
  avatar: PlantAvatarData;
  large?: boolean;
  /** Shovel mode: the sprite squirms in its pot to say "tap me to dig". */
  wiggle?: boolean;
}) {
  const showSprite = Boolean(avatar.spriteUrl?.trim());

  return (
    <span
      className={`plant-avatar ${avatar.color}${large ? ' large' : ''}${
        showSprite ? ' has-sprite' : ''
      }`}
      role="img"
      aria-label={`${avatar.name} avatar`}
    >
      <PottedSprite spriteUrl={avatar.spriteUrl} wiggle={wiggle} />
    </span>
  );
}

export function BotAvatar({
  name,
  spriteUrl,
}: {
  name: string;
  spriteUrl?: string;
}) {
  const showSprite = Boolean(spriteUrl?.trim());

  return (
    <span
      className={showSprite ? 'bot-avatar has-sprite' : 'bot-avatar'}
      role="img"
      aria-label={`${name} avatar`}
    >
      <PottedSprite spriteUrl={spriteUrl} />
    </span>
  );
}

/**
 * How a plant was captured, said plainly.
 *
 * The record has carried `source` since the archive existed, but nothing ever
 * showed it, so the one visible consequence — a web upload quietly dropping out
 * of the battle picker a day later — looked like a bug. The badge and the
 * lifetime come from the same field, so what this says is what will happen.
 */
export function CaptureBadge({
  source,
  className = '',
}: {
  source?: 'mobile' | 'web';
  className?: string;
}) {
  if (!source) return null;
  const isUpload = source === 'web';

  return (
    <span
      className={`font-pixel inline-block border-2 border-black px-1 text-[7px] ${className}`}
      style={{
        background: isUpload ? 'var(--color-hp-mid)' : 'var(--color-hp-high)',
        color: isUpload ? '#1a1a1a' : '#fff',
      }}
    >
      {isUpload ? 'Web Upload' : 'IRL Scan'}
    </span>
  );
}

/** The Sprout mark — a seedling inside a camera aperture. */
export function SproutMark() {
  return (
    <img
      className="sprout-mark"
      src="/brand/sprout_mark_white.png"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/** Three pots on a shelf — the decorative aside on the auth and contact pages. */
export function MiniArchive() {
  return (
    <div className="mini-archive" aria-hidden="true">
      <div className="mini-archive-slots">
        {plantAvatars.slice(0, 3).map((avatar) => (
          <PlantAvatar key={avatar.id} avatar={avatar} />
        ))}
      </div>
      <img className="shelf-art" src="/img/ic_shelf.png" alt="" draggable={false} />
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

export function HealthBar({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number;
}) {
  const boundedMax = Number.isFinite(max) ? Math.max(0, max) : 0;
  const boundedCurrent = Number.isFinite(current)
    ? Math.min(Math.max(0, current), boundedMax)
    : 0;
  const percentage = boundedMax > 0 ? (boundedCurrent / boundedMax) * 100 : 0;
  // Green above 50%, amber above 20%, red below — standard HP-bar banding,
  // carried over from the Android battle screen.
  const band =
    percentage > 50 ? 'is-high' : percentage > 20 ? 'is-mid' : 'is-low';

  return (
    <div
      className={`health-meter ${band}`}
      role="progressbar"
      aria-label={`${label} ${boundedCurrent} of ${boundedMax}`}
      aria-valuemin={0}
      aria-valuemax={boundedMax}
      aria-valuenow={boundedCurrent}
    >
      <span>HP</span>
      <div>
        <i style={{ width: `${percentage}%` }} />
      </div>
      <strong>
        {boundedCurrent} / {boundedMax}
      </strong>
    </div>
  );
}
