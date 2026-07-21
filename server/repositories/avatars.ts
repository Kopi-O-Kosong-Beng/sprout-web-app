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
import {
  DEMO_AVATAR_TEMPLATES,
  DEMO_SET_VERSION,
  demoAvatarId,
  type DemoAvatarTemplate,
} from '../data/demo-avatar-templates';
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

const DEFAULT_ARCHIVE_PAGE = 1;
const DEFAULT_ARCHIVE_PAGE_SIZE = 20;

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

function demoSpriteUrl(template: DemoAvatarTemplate): string {
  return `/static/sprites/${template.speciesName.toLowerCase().replace(/\s+/g, '-')}.png`;
}

function buildDemoAvatarRecord(
  userId: string,
  template: DemoAvatarTemplate,
  now: Date
): AvatarRecord {
  return {
    id: demoAvatarId(userId, template.id),
    userId,
    speciesName: template.speciesName,
    speciesFamily: template.speciesFamily,
    spriteUrl: demoSpriteUrl(template),
    discoveredAt: now.toISOString(),
    source: template.source,
    isTemporary: template.isTemporary,
    expiresAt: template.isTemporary
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null,
    stats: template.stats,
    metadata: {
      ...template.metadata,
      isDemo: true,
      version: DEMO_SET_VERSION,
      templateId: template.id,
      displayName: template.speciesName,
      presentationKey: `demo:${template.id}`,
    },
  };
}

function isVerifiedDemoRecord(
  data: FirebaseFirestore.DocumentData | undefined,
  userId: string,
  template: DemoAvatarTemplate
): boolean {
  if (!data || data.userId !== userId) return false;
  const metadata = data.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return false;
  }
  return (
    metadata.isDemo === true &&
    metadata.version === DEMO_SET_VERSION &&
    metadata.templateId === template.id
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 6
  );
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

  async ensureDemoSet(userId: string): Promise<PaginatedAvatars> {
    const db = getDb();
    const refs = DEMO_AVATAR_TEMPLATES.map((template) =>
      db.collection('avatar_records').doc(demoAvatarId(userId, template.id))
    );
    const existing = await db.getAll(...refs);
    const now = new Date();
    const batch = db.batch();
    let hasCreates = false;

    existing.forEach((document, index) => {
      if (document.exists) return;
      batch.create(
        document.ref,
        buildDemoAvatarRecord(userId, DEMO_AVATAR_TEMPLATES[index], now)
      );
      hasCreates = true;
    });

    if (hasCreates) {
      try {
        await batch.commit();
      } catch (error) {
        // A concurrent caller may have created the same deterministic records.
        if (isAlreadyExistsError(error)) return this.ensureDemoSet(userId);
        throw error;
      }
    }
    return this.listByUser(userId, DEFAULT_ARCHIVE_PAGE, DEFAULT_ARCHIVE_PAGE_SIZE);
  },

  async removeDemoSet(userId: string): Promise<PaginatedAvatars> {
    const db = getDb();
    const refs = DEMO_AVATAR_TEMPLATES.map((template) =>
      db.collection('avatar_records').doc(demoAvatarId(userId, template.id))
    );
    const existing = await db.getAll(...refs);
    const batch = db.batch();
    let hasDeletes = false;

    existing.forEach((document, index) => {
      if (!document.exists) return;
      if (!isVerifiedDemoRecord(document.data(), userId, DEMO_AVATAR_TEMPLATES[index])) {
        return;
      }
      batch.delete(document.ref);
      hasDeletes = true;
    });

    if (hasDeletes) await batch.commit();
    return this.listByUser(userId, DEFAULT_ARCHIVE_PAGE, DEFAULT_ARCHIVE_PAGE_SIZE);
  },
};

export default firestoreAvatarRepository;
