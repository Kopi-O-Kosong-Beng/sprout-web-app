/** Firestore dex-candidate repository.
 *
 *  Document id is `${speciesKey}__v${version}`, so recording a version twice is
 *  a create() conflict rather than a silent overwrite — the allocation loop in
 *  scan-persistence leans on that.
 */
import { getDb } from '../firebase';
import type {
  DexCandidate,
  DexCandidateRepository,
  DexCandidateStatus,
} from '../models/dexCandidate';

const COLLECTION = 'dex_candidates';
const DEX_COLLECTION = 'dex';

/** Firestore's gRPC code for "create() hit an existing document". */
const ALREADY_EXISTS = 6;

export function isAlreadyExists(error: unknown): boolean {
  return (error as { code?: number })?.code === ALREADY_EXISTS;
}

export function candidateId(speciesKey: string, version: number): string {
  return `${speciesKey}__v${version}`;
}

function toCandidate(id: string, data: FirebaseFirestore.DocumentData): DexCandidate {
  return {
    id,
    speciesKey: String(data.speciesKey ?? ''),
    speciesName: String(data.speciesName ?? ''),
    version: Number(data.version ?? 0),
    spriteUrl: String(data.spriteUrl ?? ''),
    status: (data.status as DexCandidateStatus) ?? 'PENDING',
    scannedBy: String(data.scannedBy ?? ''),
    createdAt: String(data.createdAt ?? ''),
    evaluation: data.evaluation ?? null,
  };
}

export const firestoreDexCandidateRepository: DexCandidateRepository = {
  async maxVersion(speciesKey) {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('speciesKey', '==', speciesKey)
      .get();
    let max = 0;
    for (const doc of snapshot.docs) {
      const version = Number(doc.data().version ?? 0);
      if (version > max) max = version;
    }
    return max;
  },

  async create(candidate) {
    const { id, ...data } = candidate;
    await getDb().collection(COLLECTION).doc(id).create(data);
  },

  async get(id) {
    const snapshot = await getDb().collection(COLLECTION).doc(id).get();
    if (!snapshot.exists) return null;
    return toCandidate(snapshot.id, snapshot.data() ?? {});
  },

  async listAll(limit = 500) {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => toCandidate(doc.id, doc.data() ?? {}));
  },

  async publish(id) {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(id);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new Error(`No such candidate: ${id}`);
      }
      const candidate = toCandidate(snapshot.id, snapshot.data() ?? {});

      // Demote whatever is currently published for this species. Equality-only
      // filters, so no composite index is needed.
      const published = await transaction.get(
        db
          .collection(COLLECTION)
          .where('speciesKey', '==', candidate.speciesKey)
          .where('status', '==', 'PUBLISHED')
      );
      for (const doc of published.docs) {
        if (doc.id !== id) transaction.update(doc.ref, { status: 'PENDING' });
      }

      transaction.update(ref, { status: 'PUBLISHED' });

      // The dex write rides in the same transaction deliberately: the whole
      // point of publishing is that `dex.spriteUrl` and the PUBLISHED row can
      // never disagree. merge, because a dex doc could in principle be missing
      // for a legacy species and the swap must still land.
      transaction.set(
        db.collection(DEX_COLLECTION).doc(candidate.speciesKey),
        { spriteUrl: candidate.spriteUrl },
        { merge: true }
      );

      return { ...candidate, status: 'PUBLISHED' as const };
    });
  },

  async reject(id) {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(id);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new Error(`No such candidate: ${id}`);
      }
      const candidate = toCandidate(snapshot.id, snapshot.data() ?? {});
      if (candidate.status === 'PUBLISHED') {
        throw new Error(
          'Cannot reject the published sprite — publish another candidate first.'
        );
      }
      transaction.update(ref, { status: 'REJECTED' });
      return { ...candidate, status: 'REJECTED' as const };
    });
  },
};

export default firestoreDexCandidateRepository;
