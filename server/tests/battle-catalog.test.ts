import {
  createThornback,
  isAllowedPlayerMoveSet,
  resolveBattleMoves,
} from '../data/battle-catalog';
import type { BattleMove } from '../models/battle';

const themeCases = [
  {
    theme: 'Helianthus species',
    speciesName: 'Helianthus annuus',
    speciesFamily: 'Asteraceae',
    signatureName: 'Solar Bloom',
  },
  {
    theme: 'Asteraceae family',
    speciesName: 'Bellis perennis',
    speciesFamily: 'Asteraceae',
    signatureName: 'Petal Tempest',
  },
  {
    theme: 'Fagaceae family',
    speciesName: 'Quercus robur',
    speciesFamily: 'Fagaceae',
    signatureName: 'Oakheart Crash',
  },
  {
    theme: 'Araceae family',
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    signatureName: 'Monsoon Leaf',
  },
  {
    theme: 'Moraceae family',
    speciesName: 'Ficus lyrata',
    speciesFamily: 'Moraceae',
    signatureName: 'Canopy Crush',
  },
  {
    theme: 'Amanitaceae family',
    speciesName: 'Amanita muscaria',
    speciesFamily: 'Amanitaceae',
    signatureName: 'Crimson Sporeburst',
  },
  {
    theme: 'fallback',
    speciesName: 'Unknown specimen',
    speciesFamily: null,
    signatureName: 'Wild Growth',
  },
] as const;

describe('battle move catalog', () => {
  // The URL is part of the stored session contract, so it is pinned here rather
  // than derived from the catalogue — a silent change would leave every new
  // battle pointing at a file the client does not serve, which is exactly what
  // the old /static/sprites path did.
  it('points Thornback at the pre-made sprite the client serves', () => {
    expect(createThornback().spriteUrl).toBe('/sprites/thornback.png');
  });

  it.each(themeCases)(
    'accepts the complete v1 $theme move set',
    ({ speciesName, speciesFamily, signatureName }) => {
      const moves = resolveBattleMoves(speciesName, speciesFamily);

      expect(moves.find((move) => move.id === 'signature')?.name).toBe(
        signatureName
      );
      expect(isAllowedPlayerMoveSet('v1', moves)).toBe(true);
    }
  );

  it.each<{
    forgery: string;
    mutate(moves: BattleMove[]): BattleMove[];
  }>([
    {
      forgery: 'in-range signature power',
      mutate: (moves) =>
        moves.map((move) =>
          move.id === 'signature' ? { ...move, power: 51 } : move
        ),
    },
    {
      forgery: 'signature name',
      mutate: (moves) =>
        moves.map((move) =>
          move.id === 'signature' ? { ...move, name: 'Solar Bloom Prime' } : move
        ),
    },
    {
      forgery: 'signature energy cost',
      mutate: (moves) =>
        moves.map((move) =>
          move.id === 'signature' ? { ...move, energyCost: 1 } : move
        ),
    },
  ])('rejects a complete-looking v1 set with forged $forgery', ({ mutate }) => {
    const canonical = resolveBattleMoves('Helianthus annuus', 'Asteraceae');

    expect(isAllowedPlayerMoveSet('v1', mutate(canonical))).toBe(false);
  });

  it('rejects incomplete sets and unsupported catalog versions', () => {
    const canonical = resolveBattleMoves('Helianthus annuus', 'Asteraceae');

    expect(isAllowedPlayerMoveSet('v1', canonical.slice(0, 3))).toBe(false);
    expect(isAllowedPlayerMoveSet('v2', canonical)).toBe(false);
  });
});
