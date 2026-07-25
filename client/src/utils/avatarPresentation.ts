import type { PlantAvatarData } from '../components/common/PlantVisuals';
import type { AvatarRecord } from '../services/sproutApi';

const PALETTE_CLASSES = ['emerald', 'violet', 'sage', 'lime', 'clay'] as const;

function metadataString(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stablePaletteClass(key: string): (typeof PALETTE_CLASSES)[number] {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return PALETTE_CLASSES[hash % PALETTE_CLASSES.length];
}

function formatDiscoveryDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp);
}

export function toPlantAvatarData(record: AvatarRecord): PlantAvatarData {
  const presentationKey = metadataString(record.metadata, 'presentationKey');
  return {
    id: record.id,
    name: metadataString(record.metadata, 'displayName') ?? record.speciesName,
    species: record.speciesName,
    family: record.speciesFamily ?? 'Unknown family',
    discovered: formatDiscoveryDate(record.discoveredAt),
    hp: record.stats.hp,
    attack: record.stats.attack,
    defense: record.stats.defense,
    speed: record.stats.speed,
    color: stablePaletteClass(presentationKey ?? record.id),
    spriteUrl: record.spriteUrl.trim() || undefined,
    isDemo: record.metadata?.isDemo === true,
  };
}
