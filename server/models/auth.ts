export interface AuthUserProfile {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  pveXp: number;
  pveWins: number;
  pveLosses: number;
  currentPveWinStreak: number;
  bestPveWinStreak: number;
  passwordHash?: string | null;
  resetOtpHash?: string | null;
  resetOtpExpiresAt?: string | null;
  resetOtpFailedAttempts?: number;
  lastLogin?: string | null;
  lastLogout?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAuthUserProfile {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  passwordHash: string;
}

export interface PasswordHistoryEntry {
  id: string;
  userId: string;
  passwordHash: string;
  changedAt: string;
}

export interface AuthUserRepository {
  createProfile(input: CreateAuthUserProfile): Promise<AuthUserProfile>;
  getById(id: string): Promise<AuthUserProfile | null>;
  getByEmail(email: string): Promise<AuthUserProfile | null>;
  getByDisplayName(displayName: string): Promise<AuthUserProfile | null>;
  markVerified(id: string): Promise<void>;
  setResetOtp(
    id: string,
    resetOtpHash: string | null,
    resetOtpExpiresAt: string | null
  ): Promise<void>;
  recordResetOtpFailure(id: string, expectedResetOtpHash: string): Promise<number>;
  clearResetOtp(id: string, expectedResetOtpHash: string): Promise<boolean>;
  claimResetOtp(id: string, expectedResetOtpHash: string): Promise<boolean>;
  recordLogin(id: string, signedInAt?: string | null): Promise<AuthUserProfile | null>;
  recordLogout(id: string): Promise<AuthUserProfile | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  addPasswordHistory(userId: string, passwordHash: string): Promise<void>;
  listPasswordHistory(userId: string, limit: number): Promise<PasswordHistoryEntry[]>;
  prunePasswordHistory(userId: string, keep: number): Promise<void>;
}
