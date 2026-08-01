/** Scan persistence — spec 2026-08-02 sections C, E and F.
 *
 *  Kept out of the route so the ordering (store sprite, record discovery, write
 *  the archive row) is testable without an HTTP stream, and so a failure here
 *  can be reported to the user rather than crashing the generation run.
 */
import { sanitizeSpeciesKey } from '../pipeline/dex';
import { deriveSpeciesStats } from '../data/species-stats';
import type { AvatarRepository } from '../models/avatar';
import type { DexDiscovery, DexRepository } from '../models/dex';
import type { SpriteStorage } from './sprite-storage';

export interface ScanPersistenceDependencies {
  storage: SpriteStorage;
  dex: DexRepository;
  avatars: Pick<AvatarRepository, 'upsertFromScan'>;
}

export interface ScanPersistResult {
  saved: boolean;
  avatarId: string | null;
  created: boolean;
  saveError?: string;
  discovery: DexDiscovery | null;
}

export async function persistScan(
  dependencies: ScanPersistenceDependencies,
  userId: string,
  speciesName: string,
  speciesFamily: string | null,
  png: Buffer
): Promise<ScanPersistResult> {
  const failure = (saveError: string): ScanPersistResult => ({
    saved: false,
    avatarId: null,
    created: false,
    saveError,
    discovery: null,
  });

  const speciesKey = sanitizeSpeciesKey(speciesName);
  if (!speciesKey) {
    return failure('Identified species name has no usable characters');
  }

  try {
    const spriteUrl = await dependencies.storage.save(speciesKey, png);
    const discovery = await dependencies.dex.recordDiscovery(speciesKey, userId, speciesName);
    const { record, created } = await dependencies.avatars.upsertFromScan(userId, {
      speciesName,
      speciesFamily,
      spriteUrl,
      stats: deriveSpeciesStats(speciesKey),
      metadata: null,
    });

    return { saved: true, avatarId: record.id, created, discovery };
  } catch (error) {
    // Deliberately swallowed: the sprite was generated successfully and the user
    // should still see it. Section F — a save fault must not look like a
    // pipeline crash.
    const message = error instanceof Error ? error.message : String(error);
    console.error('Scan persistence failed:', message);
    return failure(message);
  }
}
