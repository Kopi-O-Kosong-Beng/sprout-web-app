import { deriveSpeciesStats, SPECIES_STAT_RANGES } from '../data/species-stats';
import { sanitizeSpeciesKey } from '../pipeline/dex';

describe('deriveSpeciesStats', () => {
  const KEYS = [
    'monstera_deliciosa',
    'helianthus_annuus',
    'quercus_robur',
    'a',
    'z'.repeat(200),
  ];

  it('returns the same stats for the same key every time', () => {
    for (const key of KEYS) {
      expect(deriveSpeciesStats(key)).toEqual(deriveSpeciesStats(key));
    }
  });

  it('keeps every stat inside its documented range', () => {
    for (const key of KEYS) {
      const stats = deriveSpeciesStats(key);
      for (const [name, range] of Object.entries(SPECIES_STAT_RANGES)) {
        const value = stats[name as keyof typeof stats];
        expect(value).toBeGreaterThanOrEqual(range.min);
        expect(value).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('returns integers, because the battle engine rejects non-integer hp', () => {
    for (const key of KEYS) {
      const stats = deriveSpeciesStats(key);
      expect(Number.isInteger(stats.hp)).toBe(true);
      expect(Number.isInteger(stats.attack)).toBe(true);
      expect(Number.isInteger(stats.defense)).toBe(true);
      expect(Number.isInteger(stats.speed)).toBe(true);
    }
  });

  it('gives different species different stats', () => {
    const a = deriveSpeciesStats('monstera_deliciosa');
    const b = deriveSpeciesStats('quercus_robur');
    expect(a).not.toEqual(b);
  });

  it('treats casing and punctuation drift as the same species', () => {
    const a = deriveSpeciesStats(sanitizeSpeciesKey('Monstera deliciosa'));
    const b = deriveSpeciesStats(sanitizeSpeciesKey('monstera  Deliciosa!'));
    expect(a).toEqual(b);
  });

  it('pins known values so the report can quote them', () => {
    expect(deriveSpeciesStats('monstera_deliciosa')).toEqual({
      hp: 110,
      attack: 49,
      defense: 61,
      speed: 35,
    });
  });
});
