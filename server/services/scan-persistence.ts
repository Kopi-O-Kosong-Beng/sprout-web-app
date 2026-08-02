/** Scan persistence — spec 2026-08-02 sections C, E and F.
 *
 *  Kept out of the route so the ordering (store sprite, record discovery, write
 *  the archive row) is testable without an HTTP stream, and so a failure here
 *  can be reported to the user rather than crashing the generation run.
 */
import { sanitizeSpeciesKey } from '../pipeline/dex';
import { deriveSpeciesStats } from '../data/species-stats';
import type { AvatarRepository } from '../models/avatar';
import type { DexRepository } from '../models/dex';
import type { DiscoveryResolver, PublicDiscovery } from './discovery';
import type { SpriteStorage } from './sprite-storage';

export interface ScanPersistenceDependencies {
  storage: SpriteStorage;
  dex: DexRepository;
  avatars: Pick<AvatarRepository, 'upsertFromScan'>;
  /** Turns the stored dex record into the block the client reads. Injected so
   *  this service stays testable without Firestore, and so the UID→display-name
   *  resolution has exactly one implementation (services/discovery.ts). */
  resolveDiscovery: DiscoveryResolver;
}

export interface ScanPersistResult {
  saved: boolean;
  avatarId: string | null;
  created: boolean;
  saveError?: string;
  discovery: PublicDiscovery | null;
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

  try {
    // sanitizeSpeciesKey lives inside this try, not above it: if speciesName
    // were ever not a string, .toLowerCase() inside it would throw, and Section
    // F's "never abort the run" guarantee must hold unconditionally — that has
    // to come back as saved: false, not an uncaught exception out of
    // runStage2cOnward. The empty-key behavior below is unchanged: it still
    // returns before any dependency I/O runs.
    const speciesKey = sanitizeSpeciesKey(speciesName);
    if (!speciesKey) {
      return failure('Identified species name has no usable characters');
    }

    // Pure computation, resolved ahead of the actual I/O calls so a bug here
    // is legible as its own thing rather than tangled up with the Firestore
    // write it happens to be constructed for.
    const stats = deriveSpeciesStats(speciesKey);

    const spriteUrl = await dependencies.storage.save(speciesKey, png);
    const dex = await dependencies.dex.recordDiscovery(speciesKey, userId, speciesName);
    const { record, created } = await dependencies.avatars.upsertFromScan(userId, {
      speciesName,
      speciesFamily,
      spriteUrl,
      stats,
      metadata: null,
    });

    // Everything durable is written by this point. Resolving the discoverer's
    // display name is presentation, so it gets its own boundary: a lookup
    // failure must degrade to `discovery: null`, never turn a saved scan into
    // saved: false. (resolveDiscovery already swallows its own errors; this
    // guards an injected resolver that does not.)
    let discovery: PublicDiscovery | null = null;
    try {
      discovery = await dependencies.resolveDiscovery(dex, userId);
    } catch (error) {
      console.error(
        'Discovery resolution failed after a successful save:',
        error instanceof Error ? error.message : String(error)
      );
    }

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
