import { randomUUID } from 'crypto';
import { getDb } from '../firebase';
import type {
  AuthUserProfile,
  AuthUserRepository,
  CreateAuthUserProfile,
  PasswordHistoryEntry,
} from '../models/auth';

function toProfile(data: FirebaseFirestore.DocumentData): AuthUserProfile {
  return data as AuthUserProfile;
}

function toHistory(data: FirebaseFirestore.DocumentData): PasswordHistoryEntry {
  return data as PasswordHistoryEntry;
}

const firestoreAuthUserRepository: AuthUserRepository = {
  async createProfile(input: CreateAuthUserProfile): Promise<AuthUserProfile> {
    const db = getDb();
    const now = new Date().toISOString();
    const record: AuthUserProfile = {
      ...input,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('users').doc(input.id).set(record);
    return record;
  },

  async getById(id: string): Promise<AuthUserProfile | null> {
    const doc = await getDb().collection('users').doc(id).get();
    return doc.exists ? toProfile(doc.data()!) : null;
  },

  async getByEmail(email: string): Promise<AuthUserProfile | null> {
    const snap = await getDb()
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    return snap.empty ? null : toProfile(snap.docs[0].data());
  },

  async markVerified(id: string): Promise<void> {
    await getDb()
      .collection('users')
      .doc(id)
      .set({ isVerified: true, updatedAt: new Date().toISOString() }, { merge: true });
  },

  async setResetOtp(
    id: string,
    resetOtpHash: string | null,
    resetOtpExpiresAt: string | null
  ): Promise<void> {
    await getDb().collection('users').doc(id).set(
      {
        resetOtpHash,
        resetOtpExpiresAt,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  },

  async updatePasswordAndClearOtp(id: string, passwordHash: string): Promise<void> {
    await getDb().collection('users').doc(id).set(
      {
        passwordHash,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  },

  async addPasswordHistory(userId: string, passwordHash: string): Promise<void> {
    const record: PasswordHistoryEntry = {
      id: randomUUID(),
      userId,
      passwordHash,
      changedAt: new Date().toISOString(),
    };
    await getDb().collection('password_history').doc(record.id).set(record);
  },

  async listPasswordHistory(
    userId: string,
    limit: number
  ): Promise<PasswordHistoryEntry[]> {
    const snap = await getDb()
      .collection('password_history')
      .where('userId', '==', userId)
      .get();
    return snap.docs
      .map((doc) => toHistory(doc.data()))
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
      .slice(0, limit);
  },

  async prunePasswordHistory(userId: string, keep: number): Promise<void> {
    const snap = await getDb()
      .collection('password_history')
      .where('userId', '==', userId)
      .get();
    const staleDocs = snap.docs
      .map((doc) => ({ id: doc.id, data: toHistory(doc.data()) }))
      .sort((a, b) => b.data.changedAt.localeCompare(a.data.changedAt))
      .slice(keep);
    if (staleDocs.length === 0) return;
    const batch = getDb().batch();
    staleDocs.forEach((doc) =>
      batch.delete(getDb().collection('password_history').doc(doc.id))
    );
    await batch.commit();
  },
};

export default firestoreAuthUserRepository;
