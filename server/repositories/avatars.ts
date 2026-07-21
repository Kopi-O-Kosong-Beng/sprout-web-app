/** Firebase Admin implementation of the avatar repository.
 *
 *  Note: we filter by userId in Firestore, then sort + paginate in memory.
 *  A `where(userId) + orderBy(discoveredAt)` query would need a composite index
 *  (created in the Firebase console). Since one user's avatar collection is
 *  small, sorting the filtered set in the app avoids that setup step entirely.
 *  If collections ever grow large, add the composite index and push the
 *  orderBy/offset/limit back into the query.
 */
import { getDb } from '../firebase';
import type {
  AvatarRecord,
  AvatarRepository,
  PaginatedAvatars,
} from '../models/avatar';
import {
  invalidFirestoreDocument,
  normalizeNullableTimestamp,
  normalizeRequiredTimestamp,
  optionalNullableString,
  requireBoolean,
  requireDocumentData,
  requireFiniteNumber,
  requireString,
  type FirestoreSnapshotLike,
} from './firestore-normalization';

function toRecord(snapshot: FirestoreSnapshotLike): AvatarRecord {
  const data = requireDocumentData(snapshot, 'avatar_records');
  if (data.source !== 'mobile' && data.source !== 'web') {
    throw invalidFirestoreDocument(
      'avatar_records',
      snapshot.id,
      'source must be mobile or web'
    );
  }
  if (typeof data.stats !== 'object' || data.stats === null || Array.isArray(data.stats)) {
    throw invalidFirestoreDocument(
      'avatar_records',
      snapshot.id,
      'stats must be an object'
    );
  }
  if (
    data.metadata !== undefined &&
    data.metadata !== null &&
    (typeof data.metadata !== 'object' || Array.isArray(data.metadata))
  ) {
    throw invalidFirestoreDocument(
      'avatar_records',
      snapshot.id,
      'metadata must be an object or null'
    );
  }

  return {
    id: snapshot.id,
    userId: requireString(data.userId, 'userId', 'avatar_records', snapshot.id),
    speciesName: requireString(
      data.speciesName,
      'speciesName',
      'avatar_records',
      snapshot.id
    ),
    speciesFamily:
      optionalNullableString(
        data.speciesFamily,
        'speciesFamily',
        'avatar_records',
        snapshot.id
      ) ?? null,
    spriteUrl: requireString(data.spriteUrl, 'spriteUrl', 'avatar_records', snapshot.id),
    discoveredAt: normalizeRequiredTimestamp(
      data.discoveredAt,
      'discoveredAt',
      'avatar_records',
      snapshot.id
    ),
    source: data.source,
    isTemporary: requireBoolean(
      data.isTemporary,
      'isTemporary',
      'avatar_records',
      snapshot.id
    ),
    expiresAt:
      normalizeNullableTimestamp(
        data.expiresAt,
        'expiresAt',
        'avatar_records',
        snapshot.id
      ) ?? null,
    stats: {
      hp: requireFiniteNumber(data.stats.hp, 'stats.hp', 'avatar_records', snapshot.id),
      attack: requireFiniteNumber(
        data.stats.attack,
        'stats.attack',
        'avatar_records',
        snapshot.id
      ),
      defense: requireFiniteNumber(
        data.stats.defense,
        'stats.defense',
        'avatar_records',
        snapshot.id
      ),
      speed: requireFiniteNumber(
        data.stats.speed,
        'stats.speed',
        'avatar_records',
        snapshot.id
      ),
    },
    metadata: (data.metadata as Record<string, unknown> | null | undefined) ?? null,
  };
}

const firestoreAvatarRepository: AvatarRepository = {
  async listByUser(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedAvatars> {
    const db = getDb();
    const snap = await db
      .collection('avatar_records')
      .where('userId', '==', userId)
      .get();

    const all = snap.docs
      .map((doc) => toRecord(doc))
      .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));

    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize),
      page,
      pageSize,
      total: all.length,
    };
  },

  async getOwned(userId: string, avatarId: string): Promise<AvatarRecord | null> {
    const db = getDb();
    const doc = await db.collection('avatar_records').doc(avatarId).get();
    if (!doc.exists) return null;
    const record = toRecord(doc);
    return record.userId === userId ? record : null;
  },
};

export default firestoreAvatarRepository;
