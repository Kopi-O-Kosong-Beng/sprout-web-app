import {
  avatarFingerprint,
  buildReconciliationPlan,
} from '../scripts/reconcile-sqlite-to-firestore';
import type { AuthUserProfile } from '../models/auth';
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
});
