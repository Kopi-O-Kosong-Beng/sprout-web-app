/** Deterministic per-species battle stats — spec 2026-08-02 section D.
 *
 *  The pipeline supplies only maxHealth (always 100) and a Math.random() speed
 *  of 5-20. That is unusable: the NPC Thornback has speed 46, so the player
 *  would always move second, and a random draw makes test values impossible to
 *  reproduce in the report. Instead every stat is derived from the species key
 *  by a pure hash, so one species always yields one set of numbers — on every
 *  machine, on every run.
 *
 *  Ranges match the seeded demo records so scanned plants are balanced against
 *  Thornback (hp 124, attack 58, defense 55, speed 46).
 */
import type { AvatarStats } from '../models/avatar';

export const SPECIES_STAT_RANGES = {
  hp: { min: 96, max: 168 },
  attack: { min: 41, max: 72 },
  defense: { min: 41, max: 88 },
  speed: { min: 22, max: 68 },
} as const;

/** FNV-1a, 32-bit. Chosen because it is short, stable, and dependency-free —
 *  crypto hashes would work too but pull in a Node built-in for no benefit. */
function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A distinct seed per stat, so hp and attack do not move together. */
const STAT_SEEDS = {
  hp: 0x811c9dc5,
  attack: 0x01000193,
  defense: 0x7fffffff,
  speed: 0x9e3779b9,
} as const;

export function deriveSpeciesStats(speciesKey: string): AvatarStats {
  const stats = {} as AvatarStats;
  for (const name of ['hp', 'attack', 'defense', 'speed'] as const) {
    const { min, max } = SPECIES_STAT_RANGES[name];
    const span = max - min + 1;
    stats[name] = min + (fnv1a(speciesKey, STAT_SEEDS[name]) % span);
  }
  return stats;
}
