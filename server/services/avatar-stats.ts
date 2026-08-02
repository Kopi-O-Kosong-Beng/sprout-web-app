/**
 * Avatar_Stats_Deriver — requirements.md Requirement 6.11.
 *
 * Battle stats are derived from the species name and family, never from the
 * pipeline's own numbers. The pipeline assembles `maxHealth: 100` for every
 * plant and a `speed` from `Math.random()`, so taking them would make one
 * species stronger than itself depending on when it was scanned, and every
 * archive card would read 100 HP. Seeding off the identification instead means
 * two players who scan the same species get the same creature, and a re-scan
 * after a lost record restores it exactly.
 *
 * The bands are the ones the hand-authored demo set already occupies, so a
 * scanned plant sits on the same scale as the seeded ones rather than
 * outclassing them.
 */
import { createHash } from 'crypto';
import type { AvatarStats } from '../models/avatar';
import { nextRandom } from './seeded-rng';

interface StatBand {
  min: number;
  max: number;
}

const BANDS: Record<keyof AvatarStats, StatBand> = {
  hp: { min: 74, max: 170 },
  attack: { min: 38, max: 92 },
  defense: { min: 28, max: 92 },
  speed: { min: 22, max: 68 },
};

/** First 32 bits of sha256 over the identification — stable across processes,
 *  unlike a string hash we would have to keep in step with the client. */
function seedFrom(speciesName: string, speciesFamily: string | null): number {
  const key = `${speciesName.trim().toLocaleLowerCase('en-US')}|${
    speciesFamily?.trim().toLocaleLowerCase('en-US') ?? ''
  }`;
  return createHash('sha256').update(key).digest().readUInt32BE(0);
}

function scale(value: number, band: StatBand): number {
  return Math.round(band.min + value * (band.max - band.min));
}

/** Deterministic stats for a species. Same name + family, same numbers. */
export function deriveAvatarStats(
  speciesName: string,
  speciesFamily: string | null
): AvatarStats {
  let state = seedFrom(speciesName, speciesFamily);
  const draw = (): number => {
    const result = nextRandom(state);
    state = result.state;
    return result.value;
  };

  return {
    hp: scale(draw(), BANDS.hp),
    attack: scale(draw(), BANDS.attack),
    defense: scale(draw(), BANDS.defense),
    speed: scale(draw(), BANDS.speed),
  };
}
