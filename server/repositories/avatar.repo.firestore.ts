/** Firestore implementation of the avatar repository.
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

function toRecord(data: FirebaseFirestore.DocumentData): AvatarRecord {
  return data as AvatarRecord;
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
      .map((d) => toRecord(d.data()))
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
    const record = toRecord(doc.data()!);
    return record.userId === userId ? record : null;
  },
};

export default firestoreAvatarRepository;
