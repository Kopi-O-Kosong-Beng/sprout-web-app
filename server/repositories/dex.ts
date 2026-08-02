/** Firestore dex repository — spec 2026-08-02 section E.
 *
 *  The species key is the document id, which makes "has anyone found this
 *  before?" a single point read and keeps the increment inside one transaction.
 */
import { getDb } from '../firebase';
import type { DexDiscovery, DexRepository } from '../models/dex';

const COLLECTION = 'dex';

function toDiscovery(speciesKey: string, data: FirebaseFirestore.DocumentData): DexDiscovery {
  return {
    speciesKey,
    speciesName: String(data.speciesName ?? speciesKey),
    firstDiscoveredBy: String(data.firstDiscoveredBy ?? ''),
    firstDiscoveredAt: String(data.firstDiscoveredAt ?? ''),
    discoveryCount: Number(data.discoveryCount ?? 0),
  };
}

export const firestoreDexRepository: DexRepository = {
  async recordDiscovery(speciesKey, userId, speciesName) {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(speciesKey);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) {
        const created: DexDiscovery = {
          speciesKey,
          speciesName,
          firstDiscoveredBy: userId,
          firstDiscoveredAt: new Date().toISOString(),
          discoveryCount: 1,
        };
        transaction.create(ref, created);
        return created;
      }

      const existing = toDiscovery(speciesKey, snapshot.data() ?? {});
      const updated: DexDiscovery = {
        ...existing,
        discoveryCount: existing.discoveryCount + 1,
      };
      // First-discoverer fields are deliberately untouched — being first is the
      // whole point of the feature, so a later scan must never overwrite it.
      transaction.update(ref, { discoveryCount: updated.discoveryCount });
      return updated;
    });
  },

  async get(speciesKey) {
    const snapshot = await getDb().collection(COLLECTION).doc(speciesKey).get();
    if (!snapshot.exists) return null;
    return toDiscovery(speciesKey, snapshot.data() ?? {});
  },
};

export default firestoreDexRepository;
