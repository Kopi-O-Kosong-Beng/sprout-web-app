import {
  avatarFingerprint,
  buildReconciliationPlan,
  createFirestoreMigrationWriter,
  executeReconciliation,
  formatReconciliationSummary,
  parseMode,
  type MigrationWriter,
} from '../scripts/reconcile-sqlite-to-firestore';
import type { AuthUserProfile, PasswordHistoryEntry } from '../models/auth';
import type { AvatarRecord } from '../models/avatar';

const DEMO_USER_ID = 'demo-user-0001';

function profile(
  id: string,
  overrides: Partial<AuthUserProfile> = {}
): AuthUserProfile {
  return {
    id,
    email: `${id}@example.test`,
    displayName: id,
    isVerified: true,
    passwordHash: 'local-password-hash',
    resetOtpHash: null,
    resetOtpExpiresAt: null,
    resetOtpFailedAttempts: 0,
    lastLogin: null,
    lastLogout: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function localDemoAvatar(id: string, userId = DEMO_USER_ID): AvatarRecord {
  return {
    id,
    userId,
    speciesName: 'Helianthus annuus',
    speciesFamily: 'Asteraceae',
    spriteUrl: 'local-sprite.png',
    discoveredAt: '2026-07-01T00:00:00.000Z',
    source: 'mobile',
    isTemporary: false,
    expiresAt: null,
    stats: { hp: 96, attack: 72, defense: 41, speed: 68 },
    metadata: null,
  };
}

function remoteDemoAvatar(id: string, userId = DEMO_USER_ID): AvatarRecord {
  return {
    ...localDemoAvatar(id, userId),
    spriteUrl: 'remote-sprite.png',
    discoveredAt: '2026-07-22T00:00:00.000Z',
  };
}

function history(id: string, userId: string): PasswordHistoryEntry {
  return {
    id,
    userId,
    passwordHash: `history-hash-${id}`,
    changedAt: '2026-07-01T00:00:00.000Z',
  };
}

class AtomicMemoryFirestore {
  readonly documents = new Map<string, unknown>();
  failNextCommit = false;
  readonly operationKinds: string[] = [];

  collection(collectionName: string) {
    return {
      doc: (id: string) => ({ collectionName, id }),
    };
  }

  batch() {
    const writes: Array<{ key: string; data: unknown }> = [];
    return {
      create: (reference: { collectionName: string; id: string }, data: unknown) => {
        this.operationKinds.push('create');
        writes.push({ key: `${reference.collectionName}/${reference.id}`, data });
        return this;
      },
      commit: async () => {
        if (this.failNextCommit) {
          this.failNextCommit = false;
          throw new Error('simulated commit failure');
        }
        if (writes.some((write) => this.documents.has(write.key))) {
          throw new Error('already exists');
        }
        writes.forEach((write) => this.documents.set(write.key, write.data));
      },
    };
  }
}

describe('Firestore reconciliation plan', () => {
  it('migrates only Auth-backed profiles missing from Firestore', () => {
    const plan = buildReconciliationPlan({
      localProfiles: [profile('active'), profile('existing'), profile('orphan')],
      firebaseAuthUids: new Set(['active', 'existing']),
      firestoreProfileUids: new Set(['existing']),
      localAvatars: [],
      firestoreAvatars: [],
    });

    expect(plan.profileUidsToCreate).toEqual(['active']);
    expect(plan.profileUidsToSkip).toEqual(['existing']);
    expect(plan.orphanProfileUids).toEqual(['orphan']);
  });

  it('clears reset state in a migrated profile', () => {
    const plan = buildReconciliationPlan({
      localProfiles: [
        profile('active', {
          resetOtpHash: 'local-reset-hash',
          resetOtpExpiresAt: '2026-07-22T01:00:00.000Z',
          resetOtpFailedAttempts: 2,
        }),
      ],
      firebaseAuthUids: new Set(['active']),
      firestoreProfileUids: new Set(),
      localAvatars: [],
      firestoreAvatars: [],
    });

    expect(plan.profilesToCreate[0]).toMatchObject({
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
    });
  });

  it('matches legacy demo avatars without relying on random IDs or timestamps', () => {
    expect(avatarFingerprint(localDemoAvatar('local-id'))).toBe(
      avatarFingerprint(remoteDemoAvatar('remote-id'))
    );
  });

  it('blocks removal for unmatched local avatars and non-demo avatar owners', () => {
    const unmatchedPlan = buildReconciliationPlan({
      localProfiles: [],
      firebaseAuthUids: new Set(),
      firestoreProfileUids: new Set(),
      localAvatars: [localDemoAvatar('local-id')],
      firestoreAvatars: [],
    });
    const nonDemoOwnerPlan = buildReconciliationPlan({
      localProfiles: [],
      firebaseAuthUids: new Set(),
      firestoreProfileUids: new Set(),
      localAvatars: [localDemoAvatar('local-id', 'active-user')],
      firestoreAvatars: [remoteDemoAvatar('remote-id', 'active-user')],
    });

    expect(unmatchedPlan.safeToRemoveSqlite).toBe(false);
    expect(unmatchedPlan.unmatchedLocalAvatarFingerprints).toHaveLength(1);
    expect(nonDemoOwnerPlan.unmatchedLocalAvatarFingerprints).toHaveLength(0);
    expect(nonDemoOwnerPlan.safeToRemoveSqlite).toBe(false);
  });

  it('defaults the command mode to dry-run and writes nothing', async () => {
    const writer: MigrationWriter = {
      createProfileWithHistory: jest.fn(),
    };
    const plan = buildReconciliationPlan({
      localProfiles: [profile('active')],
      firebaseAuthUids: new Set(['active']),
      firestoreProfileUids: new Set(),
      localAvatars: [],
      firestoreAvatars: [],
    });

    const result = await executeReconciliation({
      mode: parseMode([]),
      plan,
      localPasswordHistory: [history('active-history', 'active')],
      writer,
      output: jest.fn(),
    });

    expect(result).toEqual({ migratedProfileCount: 0, migratedPasswordHistoryCount: 0 });
    expect(writer.createProfileWithHistory).not.toHaveBeenCalled();
  });

  it('refuses unsafe apply before any write', async () => {
    const writer: MigrationWriter = {
      createProfileWithHistory: jest.fn(),
    };
    const unsafePlan = buildReconciliationPlan({
      localProfiles: [profile('active')],
      firebaseAuthUids: new Set(['active']),
      firestoreProfileUids: new Set(),
      localAvatars: [localDemoAvatar('unmatched')],
      firestoreAvatars: [],
    });

    await expect(
      executeReconciliation({
        mode: parseMode(['--apply']),
        plan: unsafePlan,
        localPasswordHistory: [],
        writer,
        output: jest.fn(),
      })
    ).rejects.toThrow('Apply refused');
    expect(writer.createProfileWithHistory).not.toHaveBeenCalled();
  });

  it('uses create-only batches and filters histories to migrated UIDs', async () => {
    const firestore = new AtomicMemoryFirestore();
    const writer = createFirestoreMigrationWriter(firestore);
    const plan = buildReconciliationPlan({
      localProfiles: [profile('active'), profile('existing')],
      firebaseAuthUids: new Set(['active', 'existing']),
      firestoreProfileUids: new Set(['existing']),
      localAvatars: [],
      firestoreAvatars: [],
    });

    const result = await executeReconciliation({
      mode: parseMode(['--apply']),
      plan,
      localPasswordHistory: [
        history('active-history', 'active'),
        history('existing-history', 'existing'),
        history('orphan-history', 'orphan'),
      ],
      writer,
      output: jest.fn(),
    });

    expect(result).toEqual({ migratedProfileCount: 1, migratedPasswordHistoryCount: 1 });
    expect(firestore.operationKinds).toEqual(['create', 'create']);
    expect([...firestore.documents.keys()].sort()).toEqual([
      'password_history/active-history',
      'users/active',
    ]);
  });

  it('keeps profile and history absent after a failed batch so retry recovers them together', async () => {
    const firestore = new AtomicMemoryFirestore();
    firestore.failNextCommit = true;
    const writer = createFirestoreMigrationWriter(firestore);
    const plan = buildReconciliationPlan({
      localProfiles: [profile('active')],
      firebaseAuthUids: new Set(['active']),
      firestoreProfileUids: new Set(),
      localAvatars: [],
      firestoreAvatars: [],
    });
    const input = {
      mode: parseMode(['--apply']),
      plan,
      localPasswordHistory: [history('active-history', 'active')],
      writer,
      output: jest.fn(),
    };

    await expect(executeReconciliation(input)).rejects.toThrow('simulated commit failure');
    expect(firestore.documents.size).toBe(0);

    await expect(executeReconciliation(input)).resolves.toEqual({
      migratedProfileCount: 1,
      migratedPasswordHistoryCount: 1,
    });
    expect([...firestore.documents.keys()].sort()).toEqual([
      'password_history/active-history',
      'users/active',
    ]);
  });

  it('formats only redacted counts and UIDs for command output', () => {
    const plan = buildReconciliationPlan({
      localProfiles: [
        profile('active', {
          email: 'private@example.test',
          passwordHash: 'private-password-hash',
          resetOtpHash: 'private-otp-hash',
        }),
      ],
      firebaseAuthUids: new Set(['active']),
      firestoreProfileUids: new Set(),
      localAvatars: [],
      firestoreAvatars: [],
    });
    const text = formatReconciliationSummary({
      mode: parseMode([]),
      localProfileCount: 1,
      firebaseAuthUserCount: 1,
      firestoreProfileCount: 0,
      localAvatarCount: 0,
      firestoreAvatarCount: 0,
      plan,
    }).join('\n');

    expect(text).toContain('Auth-backed profiles to create: 1 [active]');
    expect(text).not.toContain('private@example.test');
    expect(text).not.toContain('private-password-hash');
    expect(text).not.toContain('private-otp-hash');
  });
});
