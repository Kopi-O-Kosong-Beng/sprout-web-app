/**
 * Shared plant visuals.
 *
 * These used to be CSS-art — layered spans drawing a leaf, a face and a pot.
 * The pixel-art system ships the real painted assets the Android game used, so
 * each avatar is now the genuine composite the garden screens draw: the empty
 * pot from `/img/ic_pot_empty.png` with the plant's 192×192 sprite standing in
 * it. When a record has no usable sprite — no URL, or the URL 404s — a
 * deterministic drawn plant stands in instead (PixelPlantFallback below), so a
 * populated shelf can never silently degrade to a row of bare pots.
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

/**
 * The five demo plants, and the only thing this array feeds is MiniArchive.
 *
 * These used to be invented species — an orchid, a fern, a cactus — with no
 * `spriteUrl` between them, so every pot on the auth and contact pages fell
 * through to PixelPlantFallback and the shelf showed hand-coded SVG
 * silhouettes. The pages advertised the product with art the product does not
 * make.
 *
 * Each entry is now one of the demo species in
 * `server/data/demo-avatar-templates.ts`, pointed at that species' committed
 * pipeline render in `client/public/plants/`. Same order, same stats, same
 * families as the server's templates, so the decorative shelf and the seeded
 * archive show the same creatures rather than two unrelated sets.
 *
 * Swapping a species here means swapping the sprite with it — a name that does
 * not match its art is the bug this replaced. The fallback still stands behind
 * every entry, so a missing PNG degrades to a drawn plant rather than a bare pot.
 */
export const plantAvatars: PlantAvatarData[] = [
  {
    id: 'helianthus',
    name: 'Helianthus Flare',
    species: 'Helianthus annuus',
    family: 'Asteraceae',
    discovered: '12 Jul 2026',
    hp: 96,
    attack: 72,
    defense: 41,
    speed: 68,
    color: 'lime',
    spriteUrl: '/plants/SPRITE_Helianthus.png',
  },
  {
    id: 'quercus',
    name: 'Quercus Guard',
    species: 'Quercus robur',
    family: 'Fagaceae',
    discovered: '10 Jul 2026',
    hp: 168,
    attack: 44,
    defense: 88,
    speed: 22,
    color: 'clay',
    spriteUrl: '/plants/SPRITE_Quercus.png',
  },
  {
    id: 'monstera',
    name: 'Monstera Scout',
    species: 'Monstera deliciosa',
    family: 'Araceae',
    discovered: '08 Jul 2026',
    hp: 112,
    attack: 58,
    defense: 63,
    speed: 47,
    color: 'emerald',
    spriteUrl: '/plants/SPRITE_Monstera.png',
  },
  {
    id: 'ficus',
    name: 'Ficus Ward',
    species: 'Ficus lyrata',
    family: 'Moraceae',
    discovered: '06 Jul 2026',
    hp: 134,
    attack: 39,
    defense: 74,
    speed: 33,
    color: 'sage',
    spriteUrl: '/plants/SPRITE_Ficus.png',
  },
  {
    id: 'amanita',
    name: 'Amanita Hex',
    species: 'Amanita muscaria',
    family: 'Amanitaceae',
    discovered: '04 Jul 2026',
    hp: 74,
    attack: 91,
    defense: 28,
    speed: 55,
    color: 'violet',
    spriteUrl: '/plants/SPRITE_Amanita.png',
  },
];

/** FNV-1a, the same shape the server uses for species stats — cheap, stable,
 *  and good enough to pick a silhouette that never changes between renders. */
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Ink colors for the drawn fallback, keyed by the record's palette class so
 *  each record keeps a stable colour identity across renders. */
const FALLBACK_TONES: Record<string, { leaf: string; dark: string; glow: string }> = {
  emerald: { leaf: '#57a15e', dark: '#33693f', glow: '#a9d98b' },
  violet: { leaf: '#8a63b5', dark: '#5d3f85', glow: '#c7a6ea' },
  sage: { leaf: '#7ba179', dark: '#4f6f52', glow: '#b9d3ae' },
  lime: { leaf: '#8fbf3f', dark: '#5d8527', glow: '#cfe98a' },
  clay: { leaf: '#b07850', dark: '#7d4e33', glow: '#e0b48a' },
};

const BRAMBLE_TONE = { leaf: '#8f4a41', dark: '#5c2b26', glow: '#d98b6f' };
const THORN_TIP = '#f2e6c9';

/** 12×14 silhouettes. '.'=empty, L=leaf, D=dark, G=glow, T=thorn tip. */
const PLANT_SILHOUETTES: string[][] = [
  [
    '............',
    '....GLLG....',
    '...GLLLLG...',
    '...DLLLLD...',
    '....DLLD....',
    '.....DD.....',
    '.GG..DD..GG.',
    'GLLG.DD.GLLG',
    'GLLLGDDGLLLG',
    '.DLLLDDLLLD.',
    '..DDLDDLDD..',
    '.....DD.....',
    '.....DD.....',
    '....DDDD....',
  ],
  [
    '............',
    '....GGGG....',
    '..GGLLLLGG..',
    '.GLLLLLLLLG.',
    '.GLLGGLLLLG.',
    'DLLLLLLLLLLD',
    'DLLGLLLLGLLD',
    'DLLLLLLLLLLD',
    '.DLLLLLLLLD.',
    '..DLLLLLLD..',
    '...DDLLDD...',
    '.....DD.....',
    '.....DD.....',
    '....DDDD....',
  ],
  [
    '..G......G..',
    '.GLG....GLG.',
    '.GLLG..GLLG.',
    '..DLLGGLLD..',
    '..GLLDDLLG..',
    '.GLLD..DLLG.',
    '.DLD.GG.DLD.',
    '..D.GLLG.D..',
    '....GLLG....',
    '....DLLD....',
    '.....DD.....',
    '.....DD.....',
    '.....DD.....',
    '....DDDD....',
  ],
];

const BRAMBLE_SILHOUETTE: string[] = [
  '..T......T..',
  '..DT....TD..',
  '.TDLDDDDLDT.',
  '.DLLLLLLLLD.',
  'TDLGLLLLGLDT',
  '.DLLLDDLLLD.',
  'DLLLLLLLLLLD',
  '.DLGLLLLGLD.',
  'TDLLLDDLLLDT',
  '.DLLLLLLLLD.',
  '..TDLLLLDT..',
  '...DDDDDD...',
  '....DDDD....',
  '...DDDDDD...',
];

/** A plant drawn in code for records whose sprite is missing or failed to
 *  load. Inline SVG cannot 404, so the shelf never shows a bare pot again —
 *  this symptom shipped twice (first /static/sprites/, then uncommitted art),
 *  both times as silently-empty pots. Deterministic per record: same seed,
 *  same silhouette, same tones. */
function PixelPlantFallback({
  seed,
  tone,
  thorny = false,
  wiggle = false,
}: {
  seed: string;
  tone?: string;
  thorny?: boolean;
  wiggle?: boolean;
}) {
  const rows = thorny
    ? BRAMBLE_SILHOUETTE
    : PLANT_SILHOUETTES[hashSeed(seed) % PLANT_SILHOUETTES.length];
  const colors = thorny ? BRAMBLE_TONE : FALLBACK_TONES[tone ?? ''] ?? FALLBACK_TONES.emerald;
  const fills: Record<string, string> = {
    L: colors.leaf,
    D: colors.dark,
    G: colors.glow,
    T: THORN_TIP,
  };

  return (
    <svg
      className={wiggle ? 'plant-sprite is-procedural wiggle' : 'plant-sprite is-procedural'}
      viewBox="0 0 12 14"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rows.flatMap((row, y) =>
        Array.from(row).flatMap((cell, x) => {
          const fill = fills[cell];
          if (!fill) return [];
          return [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />];
        })
      )}
    </svg>
  );
}

/** Broken sprite URLs are logged once each — the silent onError fallback is
 *  exactly how missing art shipped twice without anyone noticing. */
const reportedSpriteFailures = new Set<string>();

/** The pot, with the sprite standing in it — or a drawn stand-in when the
 *  sprite is missing or its URL failed to load. */
function PottedSprite({
  spriteUrl,
  wiggle = false,
  fallbackSeed,
  tone,
  thorny = false,
}: {
  spriteUrl?: string;
  wiggle?: boolean;
  fallbackSeed: string;
  tone?: string;
  thorny?: boolean;
}) {
  const [failedSpriteUrl, setFailedSpriteUrl] = useState<string | null>(null);
  const trimmed = spriteUrl?.trim();
  const showSprite = Boolean(trimmed && trimmed !== failedSpriteUrl);

  return (
    <>
      <img className="pot-art" src="/img/ic_pot_empty.png" alt="" draggable={false} />
      {showSprite ? (
        <img
          className={wiggle ? 'plant-sprite wiggle' : 'plant-sprite'}
          src={trimmed}
          alt=""
          draggable={false}
          onError={() => {
            if (trimmed && !reportedSpriteFailures.has(trimmed)) {
              reportedSpriteFailures.add(trimmed);
              console.warn(`[plant-visuals] sprite failed to load: ${trimmed}`);
            }
            setFailedSpriteUrl(trimmed ?? null);
          }}
        />
      ) : (
        <PixelPlantFallback
          seed={fallbackSeed}
          tone={tone}
          thorny={thorny}
          wiggle={wiggle}
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
      <PottedSprite
        spriteUrl={avatar.spriteUrl}
        wiggle={wiggle}
        fallbackSeed={avatar.id}
        tone={avatar.color}
      />
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
      <PottedSprite spriteUrl={spriteUrl} fallbackSeed={name} thorny />
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
      className={`font-pixel inline-block border-2 border-black px-1 text-[9px] ${className}`}
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
        {/*
          Same width as the fill, but a slower transition with a delay — so on
          a hit the white trail hangs behind the coloured bar for a beat and
          the size of the damage stays readable after the bar has dropped.
          Decorative: the value is already on the progressbar above.
        */}
        <span className="trail" style={{ width: `${percentage}%` }} aria-hidden="true" />
        <i style={{ width: `${percentage}%` }} />
      </div>
      <strong>
        {boundedCurrent} / {boundedMax}
      </strong>
    </div>
  );
}
