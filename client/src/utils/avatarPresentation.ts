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
    // The photograph the sprite was drawn from, for records that have one.
    photoUrl: metadataString(record.metadata, 'photoUrl') ?? undefined,
    // How it was captured, and what that costs it. battleEligible is the
    // server's call, not a comparison we redo against the browser's clock.
    source: record.source,
    expiresAt: record.expiresAt,
    battleEligible: record.battleEligible,
    isDemo: record.metadata?.isDemo === true,
    /*
      What Plant.id told us about the species. Every one is optional: records
      saved before the pipeline persisted them carry none, and an unidentified
      scan never gets them at all.

      habitat and conservationStatus were read here until it turned out
      Plant.id returns neither, so nothing could ever populate them.
    */
    description: metadataString(record.metadata, 'description') ?? undefined,
    bestLightCondition:
      metadataString(record.metadata, 'bestLightCondition') ?? undefined,
    bestSoilType: metadataString(record.metadata, 'bestSoilType') ?? undefined,
    bestWatering: metadataString(record.metadata, 'bestWatering') ?? undefined,
    toxicity: metadataString(record.metadata, 'toxicity') ?? undefined,
    commonUses: metadataString(record.metadata, 'commonUses') ?? undefined,
  };
}
