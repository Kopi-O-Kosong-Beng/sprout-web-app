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
import { retentionForSource } from '../data/capture-source';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import { plantAssetUrl } from '../data/sprite-catalog';
import type {
  AvatarRecord,
  AvatarRepository,
  PaginatedAvatars,
  ScanUpsertInput,
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
  return plantAssetUrl(template.spriteFile);
}

/** The photograph the sprite was drawn from, shown on the specimen card. */
function demoPhotoUrl(template: DemoAvatarTemplate): string {
  return plantAssetUrl(template.photoFile);
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
    ...retentionForSource(template.source, now),
    stats: template.stats,
    metadata: {
      ...template.metadata,
      isDemo: true,
      version: DEMO_SET_VERSION,
      templateId: template.id,
      displayName: template.speciesName,
      presentationKey: `demo:${template.id}`,
      photoUrl: demoPhotoUrl(template),
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

function hasMatchingValue(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (
    typeof actual !== 'object' ||
    actual === null ||
    typeof expected !== 'object' ||
    expected === null
  ) {
    return false;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => hasMatchingValue(value, expected[index]))
    );
  }

  const actualRecord = actual as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const actualKeys = Object.keys(actualRecord);
  const expectedKeys = Object.keys(expectedRecord);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(actualRecord, key) &&
        hasMatchingValue(actualRecord[key], expectedRecord[key])
    )
  );
}

function isExactDemoRecord(
  data: FirebaseFirestore.DocumentData | undefined,
  userId: string,
  template: DemoAvatarTemplate
): boolean {
  if (!isVerifiedDemoRecord(data, userId, template)) return false;
  const metadata = data!.metadata as Record<string, unknown>;

  return (
    data!.speciesName === template.speciesName &&
    data!.speciesFamily === template.speciesFamily &&
    data!.spriteUrl === demoSpriteUrl(template) &&
    data!.source === template.source &&
    data!.isTemporary === retentionForSource(template.source).isTemporary &&
    hasMatchingValue(data!.stats, template.stats) &&
    metadata.displayName === template.speciesName &&
    metadata.presentationKey === `demo:${template.id}` &&
    metadata.photoUrl === demoPhotoUrl(template) &&
    Object.entries(template.metadata).every(([key, value]) =>
      hasMatchingValue(metadata[key], value)
    )
  );
}

interface DemoAvatarConflictError extends Error {
  status: 409;
}

function demoAvatarConflictError(): DemoAvatarConflictError {
  const error = new Error('Demo avatar set conflicts with an existing record.') as DemoAvatarConflictError;
  error.status = 409;
  return error;
}

interface EmptySpeciesNameError extends Error {
  status: 400;
}

function emptySpeciesNameError(): EmptySpeciesNameError {
  const error = new Error(
    'speciesName must contain at least one alphanumeric character'
  ) as EmptySpeciesNameError;
  error.status = 400;
  return error;
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
    const rawUserId = doc.data()?.userId;
    if (typeof rawUserId !== 'string' || rawUserId !== userId) return null;
    return toRecord(doc);
  },

  async upsertFromScan(userId: string, input: ScanUpsertInput) {
    const db = getDb();
    const speciesKey = sanitizeSpeciesKey(input.speciesName);
    if (!speciesKey) {
      throw emptySpeciesNameError();
    }

    // The repository already filters by userId and works in memory rather than
    // adding a composite index (see the note at the top of this file). Matching
    // the sanitized name here follows that same trade-off, and avoids a schema
    // migration for the seeded demo records, which carry no species key.
    //
    // Known limit: this only inspects the caller's most recent 1000 records
    // (listByUser page size below). A user with more than 1000 distinct
    // species would get a duplicate record instead of a de-duplication error.
    // Deliberately deferred per spec decision D3 (no composite index, no
    // transaction) — see the design spec discussion for this trade-off.
    const existingPage = await this.listByUser(userId, 1, 1000);
    const match = existingPage.items.find(
      (candidate) => sanitizeSpeciesKey(candidate.speciesName) === speciesKey
    );

    const now = new Date().toISOString();

    if (match) {
      // A match means the user has now genuinely scanned this species, so a
      // camera scan upgrades a temporary record to permanent — spec decision
      // D2's intent, kept.
      //
      // A re-scan never *downgrades*, though: uploading a file of a plant you
      // already caught with the camera must not put your kept record on a
      // 24-hour clock. So an upload leaves an existing permanent record alone
      // and only refreshes lastSeenAt.
      const metadata = { ...(match.metadata ?? {}), lastSeenAt: now };
      const retention =
        input.source === 'mobile' || !match.isTemporary
          ? { isTemporary: false, expiresAt: null }
          : retentionForSource(input.source, new Date(now));
      await db
        .collection('avatar_records')
        .doc(match.id)
        .update({ metadata, ...retention });
      return {
        record: { ...match, metadata, ...retention },
        created: false,
      };
    }

    const ref = db.collection('avatar_records').doc();
    const record: AvatarRecord = {
      id: ref.id,
      userId,
      speciesName: input.speciesName,
      speciesFamily: input.speciesFamily,
      spriteUrl: input.spriteUrl,
      discoveredAt: now,
      source: input.source,
      // A camera scan is a discovery and is kept; a file upload is a trial run
      // and expires in 24h (Req 6.12). One rule, in data/capture-source.ts.
      // This reverses spec decision D2, which made every scan permanent so
      // nothing could expire mid-showcase — raised with the change.
      ...retentionForSource(input.source, new Date(now)),
      stats: input.stats,
      metadata: input.metadata,
    };
    const { id, ...document } = record;
    await ref.create(document);
    return { record, created: true };
  },

  async ensureDemoSet(userId: string): Promise<PaginatedAvatars> {
    const db = getDb();
    const refs = DEMO_AVATAR_TEMPLATES.map((template) =>
      db.collection('avatar_records').doc(demoAvatarId(userId, template.id))
    );
    await db.runTransaction(async (transaction) => {
      const existing = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const now = new Date();

      existing.forEach((document, index) => {
        const template = DEMO_AVATAR_TEMPLATES[index];
        if (!document.exists) {
          transaction.create(document.ref, buildDemoAvatarRecord(userId, template, now));
          return;
        }
        // Anything that is not this user's demo record for this template is
        // someone else's data at the same id — never overwrite it.
        if (!isVerifiedDemoRecord(document.data(), userId, template)) {
          throw demoAvatarConflictError();
        }
        // It is a demo record, but the template moved under it — the sprite URL
        // changed when the hand-made art landed, for instance. Every field here
        // is ours to own, so refresh it rather than making the user toggle the
        // set off and on to pick the new one up.
        if (!isExactDemoRecord(document.data(), userId, template)) {
          transaction.set(
            document.ref,
            buildDemoAvatarRecord(userId, template, now)
          );
        }
      });
    });
    return this.listByUser(userId, DEFAULT_ARCHIVE_PAGE, DEFAULT_ARCHIVE_PAGE_SIZE);
  },

  async removeDemoSet(userId: string): Promise<PaginatedAvatars> {
    const db = getDb();
    const refs = DEMO_AVATAR_TEMPLATES.map((template) =>
      db.collection('avatar_records').doc(demoAvatarId(userId, template.id))
    );
    await db.runTransaction(async (transaction) => {
      const existing = await Promise.all(refs.map((ref) => transaction.get(ref)));

      existing.forEach((document, index) => {
        if (!document.exists) return;
        if (!isVerifiedDemoRecord(document.data(), userId, DEMO_AVATAR_TEMPLATES[index])) {
          return;
        }
        transaction.delete(document.ref);
      });
    });
    return this.listByUser(userId, DEFAULT_ARCHIVE_PAGE, DEFAULT_ARCHIVE_PAGE_SIZE);
  },
};

export default firestoreAvatarRepository;
