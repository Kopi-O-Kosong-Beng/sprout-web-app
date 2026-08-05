/** Firebase Admin is the only runtime database adapter for auth profiles. */
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import { buildAuditTimestamp } from '../utils/audit-timestamp';
import {
  invalidFirestoreDocument,
  normalizeNullableTimestamp,
  normalizeOptionalTimestamp,
  normalizeRequiredTimestamp,
  optionalAuditTimestamp,
  optionalNullableString,
  requireBoolean,
  requireDocumentData,
  requireFiniteNumber,
  requireString,
  type FirestoreSnapshotLike,
} from './firestore-normalization';
import type {
  AuthProviderTag,
  AuthUserProfile,
  AuthUserRepository,
  CreateAuthUserProfile,
  PasswordHistoryEntry,
} from '../models/auth';

/** Older documents predate the field, so an absent value is not a defect — it
 *  simply means "never observed", and the next /api/auth/me call fills it in. */
function authProviderValue(
  value: unknown,
  documentId: string
): AuthProviderTag | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'password' || value === 'google') return value;
  throw invalidFirestoreDocument(
    'users',
    documentId,
    'authProvider must be "password" or "google"'
  );
}

function progressionValue(
  value: unknown,
  fieldName: string,
  documentId: string
): number {
  if (value === undefined) return 0;
  const number = requireFiniteNumber(value, fieldName, 'users', documentId);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw invalidFirestoreDocument(
      'users',
      documentId,
      `${fieldName} must be a non-negative safe integer`
    );
  }
  return number;
}

export function decodeAuthUserProfile(
  snapshot: FirestoreSnapshotLike
): AuthUserProfile {
  const data = requireDocumentData(snapshot, 'users');
  const profile: AuthUserProfile = {
    id: snapshot.id,
    email: requireString(data.email, 'email', 'users', snapshot.id),
    displayName: requireString(data.displayName, 'displayName', 'users', snapshot.id),
    ...(typeof data.displayNameAdjustedFrom === 'string' && data.displayNameAdjustedFrom
      ? { displayNameAdjustedFrom: data.displayNameAdjustedFrom }
      : {}),
    isVerified: requireBoolean(data.isVerified, 'isVerified', 'users', snapshot.id),
    pveXp: progressionValue(data.pveXp, 'pveXp', snapshot.id),
    pveWins: progressionValue(data.pveWins, 'pveWins', snapshot.id),
    pveLosses: progressionValue(data.pveLosses, 'pveLosses', snapshot.id),
    currentPveWinStreak: progressionValue(
      data.currentPveWinStreak,
      'currentPveWinStreak',
      snapshot.id
    ),
    bestPveWinStreak: progressionValue(
      data.bestPveWinStreak,
      'bestPveWinStreak',
      snapshot.id
    ),
    passwordHash: optionalNullableString(
      data.passwordHash,
      'passwordHash',
      'users',
      snapshot.id
    ),
    resetOtpHash: optionalNullableString(
      data.resetOtpHash,
      'resetOtpHash',
      'users',
      snapshot.id
    ),
    resetOtpExpiresAt: normalizeNullableTimestamp(
      data.resetOtpExpiresAt,
      'resetOtpExpiresAt',
      'users',
      snapshot.id
    ),
    lastLogin: optionalAuditTimestamp(data.lastLogin, 'lastLogin', 'users', snapshot.id),
    lastLogout: optionalAuditTimestamp(
      data.lastLogout,
      'lastLogout',
      'users',
      snapshot.id
    ),
    createdAt: normalizeOptionalTimestamp(data.createdAt, 'createdAt', 'users', snapshot.id),
    updatedAt: normalizeOptionalTimestamp(data.updatedAt, 'updatedAt', 'users', snapshot.id),
  };
  const authProvider = authProviderValue(data.authProvider, snapshot.id);
  if (authProvider !== undefined) {
    profile.authProvider = authProvider;
  }
  // Strictly `=== true`. Anything else — absent, null, the string "true" — is
  // not a grant: this field is the whole authority behind account deletion and
  // Firestore cleanup, so it fails closed on any value it does not recognise.
  profile.isSuperAdmin = data.isSuperAdmin === true;
  if (data.resetOtpFailedAttempts !== undefined) {
    profile.resetOtpFailedAttempts = requireFiniteNumber(
      data.resetOtpFailedAttempts,
      'resetOtpFailedAttempts',
      'users',
      snapshot.id
    );
  }
  return profile;
}

function toHistory(snapshot: FirestoreSnapshotLike): PasswordHistoryEntry {
  const data = requireDocumentData(snapshot, 'password_history');
  return {
    id: snapshot.id,
    userId: requireString(data.userId, 'userId', 'password_history', snapshot.id),
    passwordHash: requireString(
      data.passwordHash,
      'passwordHash',
      'password_history',
      snapshot.id
    ),
    changedAt: normalizeRequiredTimestamp(
      data.changedAt,
      'changedAt',
      'password_history',
      snapshot.id
    ),
  };
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

async function clearMatchingResetOtp(
  id: string,
  expectedResetOtpHash: string
): Promise<boolean> {
  const db = getDb();
  const ref = db.collection('users').doc(id);
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists || doc.data()?.resetOtpHash !== expectedResetOtpHash) {
      return false;
    }
    transaction.set(
      ref,
      {
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpFailedAttempts: 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  });
}

const firestoreAuthUserRepository: AuthUserRepository = {
  async createProfile(input: CreateAuthUserProfile): Promise<AuthUserProfile> {
    const db = getDb();
    const now = new Date().toISOString();
    const record: AuthUserProfile = {
      ...input,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: 0,
      createdAt: now,
      updatedAt: now,
    };
    const reference = db.collection('users').doc(input.id);
    await reference.set(record);
    return decodeAuthUserProfile(await reference.get());
  },

  /** Clears the one-time "we renamed you" notice, once the client has shown
   *  it. Deleting the field rather than flagging it false keeps the absent
   *  case — which is every other account — the cheap one. */
  async clearDisplayNameNotice(id: string): Promise<void> {
    await getDb()
      .collection('users')
      .doc(id)
      .update({ displayNameAdjustedFrom: FieldValue.delete() });
  },

  async getById(id: string): Promise<AuthUserProfile | null> {
    const doc = await getDb().collection('users').doc(id).get();
    return doc.exists ? decodeAuthUserProfile(doc) : null;
  },

  async getByEmail(email: string): Promise<AuthUserProfile | null> {
    const snap = await getDb()
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    return snap.empty ? null : decodeAuthUserProfile(snap.docs[0]);
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
    return match ? decodeAuthUserProfile(match) : null;
  },

  async markVerified(id: string): Promise<void> {
    await getDb()
      .collection('users')
      .doc(id)
      .set({ isVerified: true, updatedAt: new Date().toISOString() }, { merge: true });
  },

  async setAuthProvider(id: string, authProvider: AuthProviderTag): Promise<void> {
    await getDb()
      .collection('users')
      .doc(id)
      .set({ authProvider, updatedAt: new Date().toISOString() }, { merge: true });
  },

  async setSuperAdmin(id: string, isSuperAdmin: boolean): Promise<void> {
    await getDb()
      .collection('users')
      .doc(id)
      .set({ isSuperAdmin, updatedAt: new Date().toISOString() }, { merge: true });
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
        resetOtpFailedAttempts: 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  },

  async recordResetOtpFailure(
    id: string,
    expectedResetOtpHash: string
  ): Promise<number> {
    const db = getDb();
    const ref = db.collection('users').doc(id);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists || doc.data()?.resetOtpHash !== expectedResetOtpHash) return 0;

      const failedAttempts = Number(doc.data()?.resetOtpFailedAttempts ?? 0) + 1;
      if (failedAttempts >= 5) {
        transaction.set(
          ref,
          {
            resetOtpHash: null,
            resetOtpExpiresAt: null,
            resetOtpFailedAttempts: 0,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        return failedAttempts;
      }

      transaction.set(
        ref,
        {
          resetOtpFailedAttempts: failedAttempts,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return failedAttempts;
    });
  },

  async clearResetOtp(id: string, expectedResetOtpHash: string): Promise<boolean> {
    return clearMatchingResetOtp(id, expectedResetOtpHash);
  },

  async claimResetOtp(id: string, expectedResetOtpHash: string): Promise<boolean> {
    return clearMatchingResetOtp(id, expectedResetOtpHash);
  },

  async recordLogin(
    id: string,
    signedInAt?: string | null
  ): Promise<AuthUserProfile | null> {
    const db = getDb();
    const ref = db.collection('users').doc(id);
    const fields = loginAuditFields(signedInAt);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) return null;
      transaction.update(ref, fields);
      return decodeAuthUserProfile({
        id: doc.id,
        data: () => ({ ...doc.data(), ...fields }),
      });
    });
  },

  async recordLogout(id: string): Promise<AuthUserProfile | null> {
    const db = getDb();
    const ref = db.collection('users').doc(id);
    const fields = logoutAuditFields();
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) return null;
      transaction.update(ref, fields);
      return decodeAuthUserProfile({
        id: doc.id,
        data: () => ({ ...doc.data(), ...fields }),
      });
    });
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await getDb().collection('users').doc(id).set(
      {
        passwordHash,
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
      .map((doc) => toHistory(doc))
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
      .slice(0, limit);
  },

  async prunePasswordHistory(userId: string, keep: number): Promise<void> {
    const snap = await getDb()
      .collection('password_history')
      .where('userId', '==', userId)
      .get();
    const staleDocs = snap.docs
      .map((doc) => ({ id: doc.id, data: toHistory(doc) }))
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
