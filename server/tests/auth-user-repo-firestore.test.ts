import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import authUserRepository from '../repositories/auth-users';
import { clearFirestore, seedFirestoreUser } from './firestore-test-utils';

const baseProfile = {
  id: 'user-1',
  email: 'user-1@example.com',
  displayName: 'User One',
  isVerified: true,
  passwordHash: 'password-hash',
  resetOtpHash: 'hashed-otp',
  resetOtpExpiresAt: '2026-07-22T01:00:00.000Z',
  resetOtpFailedAttempts: 4,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

async function readProfile() {
  return (await getDb().collection('users').doc(baseProfile.id).get()).data();
}

describe('Firestore auth user repository', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedFirestoreUser(baseProfile);
  });

  it('clears the OTP atomically when the fifth failure is recorded', async () => {
    await expect(
      authUserRepository.recordResetOtpFailure(baseProfile.id, 'hashed-otp')
    ).resolves.toBe(5);

    await expect(readProfile()).resolves.toMatchObject({
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
    });
  });

  it('does not record a failure against a newer OTP', async () => {
    await expect(
      authUserRepository.recordResetOtpFailure(baseProfile.id, 'stale-hash')
    ).resolves.toBe(0);

    await expect(readProfile()).resolves.toMatchObject({
      resetOtpHash: 'hashed-otp',
      resetOtpFailedAttempts: 4,
    });
  });

  it('does not clear a newer OTP for a stale expiry request', async () => {
    await expect(
      authUserRepository.clearResetOtp(baseProfile.id, 'stale-hash')
    ).resolves.toBe(false);

    await expect(readProfile()).resolves.toMatchObject({
      resetOtpHash: 'hashed-otp',
      resetOtpFailedAttempts: 4,
    });
  });

  it('claims and clears only the matching OTP in a transaction', async () => {
    await expect(
      authUserRepository.claimResetOtp(baseProfile.id, 'hashed-otp')
    ).resolves.toBe(true);

    await expect(readProfile()).resolves.toMatchObject({
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
    });
  });

  it('does not create partial profiles when login or logout audit targets are absent', async () => {
    await expect(
      authUserRepository.recordLogin('missing-user', '2026-07-22T01:00:00.000Z')
    ).resolves.toBeNull();
    await expect(authUserRepository.recordLogout('missing-user')).resolves.toBeNull();

    await expect(
      getDb().collection('users').doc('missing-user').get()
    ).resolves.toMatchObject({ exists: false });
  });

  it('updates existing audit fields and returns the complete profile', async () => {
    const result = await authUserRepository.recordLogin(
      baseProfile.id,
      '2026-07-22T01:00:00.000Z'
    );

    expect(result).toMatchObject({
      id: baseProfile.id,
      email: baseProfile.email,
      displayName: baseProfile.displayName,
      isVerified: true,
      passwordHash: baseProfile.passwordHash,
      lastLogin: expect.stringContaining('SGT'),
    });
    expect(result?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('derives profile IDs from paths and normalizes Firestore timestamps', async () => {
    const createdAt = new Date('2026-07-20T02:00:00.000Z');
    const updatedAt = new Date('2026-07-21T03:00:00.000Z');
    const resetExpiry = new Date('2026-07-22T04:00:00.000Z');
    await getDb().collection('users').doc('path-profile').set({
      email: 'path@example.com',
      displayName: 'Path Profile',
      isVerified: false,
      passwordHash: 'hash',
      resetOtpHash: 'otp-hash',
      resetOtpExpiresAt: Timestamp.fromDate(resetExpiry),
      resetOtpFailedAttempts: 2,
      lastLogin: Timestamp.fromDate(new Date('2026-07-19T03:00:00.000Z')),
      lastLogout: '2026-07-19T04:00:00+08:00',
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt,
    });

    await expect(authUserRepository.getById('path-profile')).resolves.toMatchObject({
      id: 'path-profile',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      resetOtpExpiresAt: resetExpiry.toISOString(),
      lastLogin: '2026-07-19T03:00:00.000Z',
      lastLogout: '2026-07-18T20:00:00.000Z',
    });
  });

  it('sorts password history by normalized timestamps and uses path IDs', async () => {
    await Promise.all([
      getDb().collection('password_history').doc('older-history').set({
        userId: baseProfile.id,
        passwordHash: 'older-hash',
        changedAt: Timestamp.fromDate(new Date('2026-07-20T00:00:00.000Z')),
      }),
      getDb().collection('password_history').doc('newer-history').set({
        userId: baseProfile.id,
        passwordHash: 'newer-hash',
        changedAt: new Date('2026-07-21T00:00:00.000Z'),
      }),
    ]);

    await expect(authUserRepository.listPasswordHistory(baseProfile.id, 10)).resolves.toEqual([
      expect.objectContaining({
        id: 'newer-history',
        changedAt: '2026-07-21T00:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'older-history',
        changedAt: '2026-07-20T00:00:00.000Z',
      }),
    ]);
  });

  it('rejects malformed required history timestamps with a controlled error', async () => {
    await getDb().collection('password_history').doc('malformed-history').set({
      userId: baseProfile.id,
      passwordHash: 'hash',
      changedAt: { seconds: 'not-a-number' },
    });

    await expect(
      authUserRepository.listPasswordHistory(baseProfile.id, 10)
    ).rejects.toThrow(
      'Invalid Firestore password_history document malformed-history: changedAt must be a timestamp.'
    );
  });

  it('rejects malformed required profile fields with a controlled error', async () => {
    await getDb().collection('users').doc('malformed-profile').set({
      displayName: 'Missing Email',
      isVerified: false,
    });

    await expect(authUserRepository.getById('malformed-profile')).rejects.toThrow(
      'Invalid Firestore users document malformed-profile: email must be a non-empty string.'
    );
  });
});
