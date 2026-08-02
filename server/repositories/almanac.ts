/** Firebase Admin implementation of the almanac discovery repository.
 *
 *  The species id is the document id, which is what makes "first discovery"
 *  safe: two players scanning the same species at once contend on one document
 *  inside a transaction, so exactly one of them can create it and the other
 *  increments the count. A collection queried by species field would let both
 *  claim the credit.
 */
import { getDb } from '../firebase';
import type {
  AlmanacDiscovery,
  AlmanacRepository,
  DiscoveryClaim,
  DiscoverySnapshot,
} from '../models/almanac';
import {
  invalidFirestoreDocument,
  normalizeRequiredTimestamp,
  optionalNullableString,
  requireDocumentData,
  requireFiniteNumber,
  requireString,
  type FirestoreSnapshotLike,
} from './firestore-normalization';

const COLLECTION = 'almanac_discoveries';

function toDiscovery(snapshot: FirestoreSnapshotLike): AlmanacDiscovery {
  const data = requireDocumentData(snapshot, COLLECTION);
  const discoveryCount = requireFiniteNumber(
    data.discoveryCount,
    'discoveryCount',
    COLLECTION,
    snapshot.id
  );
  if (discoveryCount < 1) {
    throw invalidFirestoreDocument(
      COLLECTION,
      snapshot.id,
      'discoveryCount must be at least 1'
    );
  }

  return {
    speciesId: snapshot.id,
    speciesName: requireString(data.speciesName, 'speciesName', COLLECTION, snapshot.id),
    discoveredByUserId: requireString(
      data.discoveredByUserId,
      'discoveredByUserId',
      COLLECTION,
      snapshot.id
    ),
    discoveredByName: requireString(
      data.discoveredByName,
      'discoveredByName',
      COLLECTION,
      snapshot.id
    ),
    discoveredAt: normalizeRequiredTimestamp(
      data.discoveredAt,
      'discoveredAt',
      COLLECTION,
      snapshot.id
    ),
    avatarId: requireString(data.avatarId, 'avatarId', COLLECTION, snapshot.id),
    photoUrl:
      optionalNullableString(data.photoUrl, 'photoUrl', COLLECTION, snapshot.id) ?? null,
    discoveryCount,
    ...readSnapshotFields(data, snapshot.id),
  };
}

/**
 * The finder's scan, as stored alongside the discovery.
 *
 * Every field is optional on read. Discoveries recorded before the sprite card
 * existed have none of them, and a document written by an older build must not
 * become undecodable — the almanac would start throwing 500s for a species that
 * was found perfectly legitimately. Missing pieces degrade to an entry with no
 * sprite, which the card already handles.
 */
function readSnapshotFields(
  data: FirebaseFirestore.DocumentData,
  id: string
): DiscoverySnapshot {
  const stats = typeof data.stats === 'object' && data.stats !== null ? data.stats : {};
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  return {
    spriteUrl: optionalNullableString(data.spriteUrl, 'spriteUrl', COLLECTION, id) ?? '',
    stats: {
      hp: Number(stats.hp) || 0,
      attack: Number(stats.attack) || 0,
      defense: Number(stats.defense) || 0,
      speed: Number(stats.speed) || 0,
    },
    description:
      optionalNullableString(data.description, 'description', COLLECTION, id) ?? null,
    commonNames: asStrings(data.commonNames),
    taxonomy:
      typeof data.taxonomy === 'object' && data.taxonomy !== null && !Array.isArray(data.taxonomy)
        ? Object.fromEntries(
            Object.entries(data.taxonomy).filter(
              ([, value]) => typeof value === 'string'
            ) as [string, string][]
          )
        : {},
    confidence:
      typeof data.confidence === 'number' && Number.isFinite(data.confidence)
        ? data.confidence
        : null,
  };
}

const firestoreAlmanacRepository: AlmanacRepository = {
  async recordDiscovery(claim: DiscoveryClaim): Promise<AlmanacDiscovery> {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(claim.speciesId);

    return db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);

      if (!existing.exists) {
        const created = {
          speciesName: claim.speciesName,
          discoveredByUserId: claim.userId,
          discoveredByName: claim.displayName,
          discoveredAt: claim.discoveredAt,
          avatarId: claim.avatarId,
          photoUrl: claim.photoUrl,
          discoveryCount: 1,
          spriteUrl: claim.spriteUrl,
          stats: claim.stats,
          description: claim.description,
          commonNames: claim.commonNames,
          taxonomy: claim.taxonomy,
          confidence: claim.confidence,
        };
        transaction.create(ref, created);
        return { speciesId: claim.speciesId, ...created };
      }

      // Already found. The credit is not transferable, so only the tally moves.
      const current = toDiscovery(existing);
      const discoveryCount = current.discoveryCount + 1;
      transaction.update(ref, { discoveryCount });
      return { ...current, discoveryCount };
    });
  },

  async listDiscoveries(): Promise<AlmanacDiscovery[]> {
    const snapshot = await getDb().collection(COLLECTION).get();
    return snapshot.docs.map((doc) => toDiscovery(doc));
  },
};

export default firestoreAlmanacRepository;
