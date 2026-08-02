import type { AvatarStats } from './avatar';

/** Almanac discovery domain model.
 *
 *  One document per species, created by whoever scans it first and updated by
 *  everyone after. The species is the key, not the scan: the almanac answers
 *  "has anyone found this yet, and who got there first", which is a different
 *  question from the per-player archive.
 */

/** What the first finder's scan produced, snapshotted onto the discovery.
 *
 *  Denormalised deliberately. The alternative is reading another player's
 *  avatar record at display time, which means an unscoped read of a document
 *  the caller does not own — the archive repository is ownership-scoped for
 *  exactly that reason. Copying the presentable parts keeps the almanac's read
 *  path off other people's private records entirely.
 */
export interface DiscoverySnapshot {
  /** The finished sprite, as stored on the avatar record. */
  spriteUrl: string;
  stats: AvatarStats;
  /** Plant.id's prose, kept whole here and shortened for display. */
  description: string | null;
  commonNames: string[];
  taxonomy: Record<string, string>;
  /** Identification confidence, 0-1, when the scan recorded one. */
  confidence: number | null;
}

export interface AlmanacDiscovery extends DiscoverySnapshot {
  /** Slugified binomial, matching AlmanacSpecies.id. */
  speciesId: string;
  /** The scientific name as identified, which may carry more than the binomial. */
  speciesName: string;
  /** uid of the first finder. Never sent to unauthenticated callers. */
  discoveredByUserId: string;
  /** Their display name at the time of discovery, so the credit survives a rename. */
  discoveredByName: string;
  discoveredAt: string;
  /** The avatar record the discovery came from. */
  avatarId: string;
  /** The finder's original photograph, when the scan kept one. */
  photoUrl: string | null;
  /** How many times the species has been scanned, by anyone. */
  discoveryCount: number;
}

/** What the finder's scan contributed, handed to the repository on a scan. */
export interface DiscoveryClaim extends DiscoverySnapshot {
  speciesId: string;
  speciesName: string;
  userId: string;
  displayName: string;
  avatarId: string;
  photoUrl: string | null;
  discoveredAt: string;
}

export interface AlmanacRepository {
  /** Records a scan against a species: first one wins the credit, the rest
   *  only add to the count. Returns the discovery as it now stands. */
  recordDiscovery(claim: DiscoveryClaim): Promise<AlmanacDiscovery>;
  /** Every discovery so far, for assembling the almanac. */
  listDiscoveries(): Promise<AlmanacDiscovery[]>;
}
