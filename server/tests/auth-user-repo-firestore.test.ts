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
});
