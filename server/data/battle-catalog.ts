import type {
  AvatarBattleInput,
  BattleMove,
  BattleParticipant,
} from '../models/battle';

export const MOVE_CATALOG_VERSION = 'v1' as const;
export const NPC_PRESET_VERSION = 'thornback-v1' as const;

interface MoveTheme {
  quickName: string;
  signatureName: string;
  signaturePower: number;
  signatureAccuracy: number;
}

const FALLBACK_THEME: MoveTheme = {
  quickName: 'Leaf Tap',
  signatureName: 'Wild Growth',
  signaturePower: 46,
  signatureAccuracy: 90,
};

const SPECIES_THEMES: Readonly<Record<string, MoveTheme>> = {
  'helianthus annuus': {
    quickName: 'Sunseed Strike',
    signatureName: 'Solar Bloom',
    signaturePower: 50,
    signatureAccuracy: 88,
  },
};

const FAMILY_THEMES: Readonly<Record<string, MoveTheme>> = {
  asteraceae: {
    quickName: 'Petal Jab',
    signatureName: 'Petal Tempest',
    signaturePower: 48,
    signatureAccuracy: 88,
  },
  fagaceae: {
    quickName: 'Acorn Strike',
    signatureName: 'Oakheart Crash',
    signaturePower: 48,
    signatureAccuracy: 88,
  },
  araceae: {
    quickName: 'Vine Lash',
    signatureName: 'Monsoon Leaf',
    signaturePower: 47,
    signatureAccuracy: 89,
  },
  moraceae: {
    quickName: 'Root Snap',
    signatureName: 'Canopy Crush',
    signaturePower: 49,
    signatureAccuracy: 87,
  },
  amanitaceae: {
    quickName: 'Spore Tap',
    signatureName: 'Crimson Sporeburst',
    signaturePower: 52,
    signatureAccuracy: 85,
  },
};

function normalizeTaxon(value: string | null): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function movesFromTheme(theme: MoveTheme): BattleMove[] {
  return [
    {
      id: 'quick',
      name: theme.quickName,
      kind: 'quick',
      power: 22,
      accuracy: 100,
      energyGain: 1,
      energyCost: 0,
    },
    {
      id: 'guard',
      name: 'Leaf Guard',
      kind: 'guard',
      power: 0,
      accuracy: 100,
      energyGain: 1,
      energyCost: 0,
    },
    {
      id: 'signature',
      name: theme.signatureName,
      kind: 'signature',
      power: theme.signaturePower,
      accuracy: theme.signatureAccuracy,
      energyGain: 0,
      energyCost: 2,
    },
    {
      id: 'photosynthesis',
      name: 'Photosynthesis',
      kind: 'heal',
      power: 0,
      accuracy: 100,
      energyGain: 0,
      energyCost: 0,
    },
  ];
}

export function resolveBattleMoves(
  speciesName: string,
  speciesFamily: string | null
): BattleMove[] {
  const theme =
    SPECIES_THEMES[normalizeTaxon(speciesName)] ??
    FAMILY_THEMES[normalizeTaxon(speciesFamily)] ??
    FALLBACK_THEME;
  return movesFromTheme(theme);
}

export function createPlayerParticipant(input: AvatarBattleInput): BattleParticipant {
  return {
    id: input.id,
    name: input.name,
    spriteUrl: input.spriteUrl,
    stats: { ...input.stats },
    currentHp: input.stats.hp,
    maxHp: input.stats.hp,
    energy: 0,
    healUsed: false,
    moves: resolveBattleMoves(input.name, input.speciesFamily),
  };
}

export function createThornback(): BattleParticipant {
  return {
    id: 'thornback',
    name: 'Thornback',
    spriteUrl: '/static/sprites/thornback.png',
    stats: { hp: 124, attack: 58, defense: 55, speed: 46 },
    currentHp: 124,
    maxHp: 124,
    energy: 0,
    healUsed: false,
    moves: movesFromTheme({
      quickName: 'Thorn Jab',
      signatureName: 'Briar Barrage',
      signaturePower: 48,
      signatureAccuracy: 87,
    }).map((move) =>
      move.id === 'guard' ? { ...move, name: 'Bramble Bastion' } : move
    ),
  };
}
