import { deriveAvatarStats } from '../services/avatar-stats';

const SPECIES: Array<[string, string | null]> = [
  ['Helianthus annuus', 'Asteraceae'],
  ['Quercus robur', 'Fagaceae'],
  ['Monstera deliciosa', 'Araceae'],
  ['Amanita muscaria', 'Amanitaceae'],
  ['Unknown Plant', null],
];

describe('Avatar_Stats_Deriver (Req 6.11)', () => {
  it('returns the same stats for the same identification', () => {
    for (const [name, family] of SPECIES) {
      expect(deriveAvatarStats(name, family)).toEqual(
        deriveAvatarStats(name, family)
      );
    }
  });

  it('ignores case and surrounding whitespace in the identification', () => {
    expect(deriveAvatarStats('  monstera DELICIOSA ', ' araceae ')).toEqual(
      deriveAvatarStats('Monstera deliciosa', 'Araceae')
    );
  });

  it('keeps every stat inside the demo set’s bands', () => {
    for (const [name, family] of SPECIES) {
      const stats = deriveAvatarStats(name, family);
      expect(stats.hp).toBeGreaterThanOrEqual(74);
      expect(stats.hp).toBeLessThanOrEqual(170);
      expect(stats.attack).toBeGreaterThanOrEqual(38);
      expect(stats.attack).toBeLessThanOrEqual(92);
      expect(stats.defense).toBeGreaterThanOrEqual(28);
      expect(stats.defense).toBeLessThanOrEqual(92);
      expect(stats.speed).toBeGreaterThanOrEqual(22);
      expect(stats.speed).toBeLessThanOrEqual(68);
      expect(Object.values(stats).every(Number.isInteger)).toBe(true);
    }
  });

  it('separates species that share a family', () => {
    expect(deriveAvatarStats('Quercus robur', 'Fagaceae')).not.toEqual(
      deriveAvatarStats('Quercus rubra', 'Fagaceae')
    );
  });

  it('separates one species from an unfamilied record of the same name', () => {
    expect(deriveAvatarStats('Quercus robur', 'Fagaceae')).not.toEqual(
      deriveAvatarStats('Quercus robur', null)
    );
  });
});
