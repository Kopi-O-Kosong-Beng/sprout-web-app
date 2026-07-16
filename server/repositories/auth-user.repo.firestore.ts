import { randomUUID } from 'crypto';
import { getDb } from '../firebase';
import { buildAuditTimestamp } from '../utils/audit-timestamp';
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

function loginAuditFields(signedInAt?: string | null) {
  const source = signedInAt ? new Date(signedInAt) : new Date();
  const stamp = buildAuditTimestamp(
    Number.isNaN(source.getTime()) ? new Date() : source
  );
  return {
    lastLogin: stamp.readable,
    updatedAt: stamp.iso,
  };
}

function logoutAuditFields() {
  const stamp = buildAuditTimestamp();
  return {
    lastLogout: stamp.readable,
    updatedAt: stamp.iso,
  };
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

  async getByDisplayName(displayName: string): Promise<AuthUserProfile | null> {
    const key = displayName.trim().toLowerCase();
    const snap = await getDb().collection('users').get();
    const match = snap.docs.find((doc) => {
      const data = doc.data();
      return typeof data.displayName === 'string'
        ? data.displayName.trim().toLowerCase() === key
        : false;
    });
    return match ? toProfile(match.data()) : null;
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

  async recordLogin(
    id: string,
    signedInAt?: string | null
  ): Promise<AuthUserProfile | null> {
    const ref = getDb().collection('users').doc(id);
    await ref.set(loginAuditFields(signedInAt), { merge: true });
    const doc = await ref.get();
    return doc.exists ? toProfile(doc.data()!) : null;
  },

  async recordLogout(id: string): Promise<AuthUserProfile | null> {
    const ref = getDb().collection('users').doc(id);
    await ref.set(logoutAuditFields(), { merge: true });
    const doc = await ref.get();
    return doc.exists ? toProfile(doc.data()!) : null;
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
