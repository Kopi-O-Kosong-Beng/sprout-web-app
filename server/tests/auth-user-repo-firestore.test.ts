const mockTransactionGet = jest.fn(async () => ({
  exists: true,
  data: () => ({ resetOtpHash: 'hashed-otp', resetOtpFailedAttempts: 4 }),
}));
const mockTransactionSet = jest.fn();
const mockDocumentSet = jest.fn();
const mockTransaction = {
  get: mockTransactionGet,
  set: mockTransactionSet,
};
const mockRunTransaction = jest.fn(async (callback: (tx: typeof mockTransaction) => unknown) => {
  return callback(mockTransaction);
});
const mockDocument = { id: 'user-1', set: mockDocumentSet };
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
      recordResetOtpFailure(id: string, expectedResetOtpHash: string): Promise<number>;
    };

    await expect(
      repository.recordResetOtpFailure('user-1', 'hashed-otp')
    ).resolves.toBe(5);

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

  it('does not record a failure against a newer OTP', async () => {
    mockTransactionGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ resetOtpHash: 'fresh-hash', resetOtpFailedAttempts: 0 }),
    });
    const repository = firestoreAuthUserRepository as unknown as {
      recordResetOtpFailure(id: string, expectedResetOtpHash: string): Promise<number>;
    };

    await expect(
      repository.recordResetOtpFailure('user-1', 'stale-hash')
    ).resolves.toBe(0);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('does not clear a newer OTP for a stale expiry request', async () => {
    mockTransactionGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ resetOtpHash: 'fresh-hash', resetOtpFailedAttempts: 0 }),
    });
    const repository = firestoreAuthUserRepository as unknown as {
      clearResetOtp(id: string, expectedResetOtpHash: string): Promise<boolean>;
    };

    await expect(repository.clearResetOtp('user-1', 'stale-hash')).resolves.toBe(false);
    expect(mockTransactionSet).not.toHaveBeenCalled();
    expect(mockDocumentSet).not.toHaveBeenCalled();
  });

  it('claims and clears only the matching OTP in a transaction', async () => {
    mockTransactionGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ resetOtpHash: 'claim-hash', resetOtpFailedAttempts: 2 }),
    });
    const repository = firestoreAuthUserRepository as unknown as {
      claimResetOtp(id: string, expectedResetOtpHash: string): Promise<boolean>;
    };

    await expect(repository.claimResetOtp('user-1', 'claim-hash')).resolves.toBe(true);
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
