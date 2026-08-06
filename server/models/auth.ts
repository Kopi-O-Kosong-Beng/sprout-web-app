/** Which credential actually signs this account in.
 *
 *  Firebase runs "one account per email", and Google is a trusted provider: if
 *  someone signs in with Google on an address that already holds an *unverified*
 *  password account, Firebase keeps the uid but unlinks the password and links
 *  Google in its place. The account is then Google-only, and the password the
 *  user set at signup no longer opens it.
 *
 *  Storing the outcome lets the login screen say so instead of "Invalid email or
 *  password", which is technically true and completely unhelpful.
 */
export type AuthProviderTag = 'password' | 'google';

export interface AuthUserProfile {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  /** What auto-provisioning wanted to call them before it found the name
   *  taken. Present until the client has told them and cleared it. */
  displayNameAdjustedFrom?: string;
  authProvider?: AuthProviderTag;
  /** Grants the operator tools: Studio, API Test, Ticket Manager, Admin.
   *
   *  Absent on every document written before this field existed, and absent
   *  means "not a superadmin" — the gate reads `=== true`, so a missing,
   *  null or malformed value denies rather than grants. */
  isSuperAdmin?: boolean;
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
  authProvider?: AuthProviderTag;
  isSuperAdmin?: boolean;
  /** Set only when auto-provisioning had to change the name it derived from
   *  the email because someone already had it. Holds what was asked for, so
   *  the client can say what happened, and is cleared once it has. */
  displayNameAdjustedFrom?: string;
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
  /** Clears the one-time notice that auto-provisioning renamed this account,
   *  once the client has shown it to the player. */
  clearDisplayNameNotice(id: string): Promise<void>;
  markVerified(id: string): Promise<void>;
  setAuthProvider(id: string, authProvider: AuthProviderTag): Promise<void>;
  setSuperAdmin(id: string, isSuperAdmin: boolean): Promise<void>;
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
