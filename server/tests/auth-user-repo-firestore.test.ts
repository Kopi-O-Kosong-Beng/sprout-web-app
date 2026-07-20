const mockTransactionGet = jest.fn(async () => ({
  exists: true,
  data: () => ({ resetOtpHash: 'hashed-otp', resetOtpFailedAttempts: 4 }),
}));
const mockTransactionSet = jest.fn();
const mockTransaction = {
  get: mockTransactionGet,
  set: mockTransactionSet,
};
const mockRunTransaction = jest.fn(async (callback: (tx: typeof mockTransaction) => unknown) => {
  return callback(mockTransaction);
});
const mockDocument = { id: 'user-1' };
const mockDb = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => mockDocument),
  })),
  runTransaction: mockRunTransaction,
};

jest.mock('../firebase', () => ({
  getDb: () => mockDb,
}));

import firestoreAuthUserRepository from '../repositories/auth-user.repo.firestore';

describe('Firestore auth user repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the OTP atomically when the fifth failure is recorded', async () => {
    const repository = firestoreAuthUserRepository as unknown as {
      recordResetOtpFailure(id: string): Promise<number>;
    };

    await expect(repository.recordResetOtpFailure('user-1')).resolves.toBe(5);

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      mockDocument,
      expect.objectContaining({
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpFailedAttempts: 0,
      }),
      { merge: true }
    );
  });
});
