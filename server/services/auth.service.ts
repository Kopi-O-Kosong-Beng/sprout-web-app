import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import authUserRepository from '../repositories/auth-users';
import { send as sendEmail } from './email.service';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from './password-policy';
import type { AuthProviderTag, AuthUserProfile } from '../models/auth';
import { backgroundDispatcher } from '../utils/background-dispatch';

export const GOOGLE_ONLY_SIGNUP_MESSAGE =
  'This email is already registered through Google. Continue with Google instead.';

const RESET_OTP_TTL_MS = 15 * 60 * 1000;
const PASSWORD_HISTORY_KEEP = 3;
const RESET_REQUEST_MESSAGE = 'If an account exists, a reset code has been sent.';
const SIGNUP_VERIFICATION_FAILURE_MESSAGE =
  'Account created, but the verification email could not be sent. Sign in and request a new link.';

function bcryptCost(): number {
  const configured = Number(process.env.BCRYPT_COST ?? 12);
  if (!Number.isInteger(configured) || configured < 4 || configured > 15) return 12;
  return process.env.NODE_ENV === 'test' ? configured : Math.max(12, configured);
}
const RESEND_VERIFICATION_FAILURE_MESSAGE =
  'The verification email could not be sent. Please try again.';

interface HttpError extends Error {
  status?: number;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
}

export interface VerificationEmailResult {
  verificationEmailSent: boolean;
  message: string;
}

export interface SignupResult extends VerificationEmailResult {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface PublicProfile {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  /** Present once, on the sign-in where the name was taken and a variant was
   *  assigned. The client tells the player and clears it. */
  displayNameAdjustedFrom?: string;
  authProvider?: AuthProviderTag;
  lastLogin?: string | null;
  lastLogout?: string | null;
}

function httpError(status: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  return err;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertStrongPassword(password: string): void {
  // Rule and copy both live in password-policy, so this check, the seed-admin
  // script and the client's mirror cannot drift apart.
  if (!isStrongPassword(password)) {
    throw httpError(400, PASSWORD_POLICY_MESSAGE);
  }
}

function isFirebaseDuplicateEmail(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'auth/email-already-exists'
  );
}

function toPublicProfile(profile: AuthUserProfile): PublicProfile {
  return {
    uid: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    emailVerified: profile.isVerified,
    ...(profile.displayNameAdjustedFrom
      ? { displayNameAdjustedFrom: profile.displayNameAdjustedFrom }
      : {}),
    ...(profile.authProvider ? { authProvider: profile.authProvider } : {}),
    lastLogin: profile.lastLogin ?? null,
    lastLogout: profile.lastLogout ?? null,
  };
}

async function getFirebaseAuthAdmin() {
  const { getAuthAdmin } = await import('../firebase');
  return getAuthAdmin();
}

function frontendBaseUrl(): string {
  return process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
}

function toSproutVerificationLink(firebaseLink: string): string {
  const source = new URL(firebaseLink);
  const target = new URL('/verify-email', frontendBaseUrl());
  source.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  return target.toString();
}

async function deliverVerificationEmail(
  email: string,
  displayName: string,
  failureMessage: string
): Promise<VerificationEmailResult> {
  try {
    const authAdmin = await getFirebaseAuthAdmin();
    const generated = await authAdmin.generateEmailVerificationLink(email, {
      url: new URL('/verify-email', frontendBaseUrl()).toString(),
      handleCodeInApp: false,
    });
    const link = toSproutVerificationLink(generated);
    await sendEmail({
      to: email,
      subject: 'Verify your Sprout account',
      text: `Welcome to Sprout, ${displayName}!\n\nOpen this link to verify your email:\n${link}\n`,
    });
    return {
      verificationEmailSent: true,
      message: 'Check your email for the verification link.',
    };
  } catch (err) {
    // The error class and machine code name the failing stage (Firebase link
    // generation vs the email transport) — without them nothing distinguishes
    // "SMTP blocked" from "continue-URL not whitelisted", and this exact
    // symptom shipped twice with an unexplained generic message. Codes only,
    // never raw messages: Firebase embeds the recipient address in some of
    // its message strings, and an email address does not belong in the log.
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    const name = err instanceof Error ? err.name : typeof err;
    console.error(
      `[auth] verification email delivery failed — ${name}${code ? ` (${code})` : ''}`
    );
    return {
      verificationEmailSent: false,
      message: failureMessage,
    };
  }
}

/** Firebase Auth is the authority on how an account signs in; the Firestore
 *  document only mirrors it. Google wins when both are linked, because that is
 *  exactly the case where Firebase has dropped the password. */
function providerFromRecord(providerIds: string[]): AuthProviderTag {
  return providerIds.includes('google.com') ? 'google' : 'password';
}

interface FirebaseSignInFacts {
  lastSignInTime: string | null;
  authProvider: AuthProviderTag | null;
}

/** One Admin SDK read for both the login audit stamp and the provider tag —
 *  /api/auth/me runs on every page load, so a second round trip would be paid
 *  on each one. */
async function getFirebaseSignInFacts(uid: string): Promise<FirebaseSignInFacts> {
  try {
    const authAdmin = await getFirebaseAuthAdmin();
    const firebaseUser = await authAdmin.getUser(uid);
    return {
      lastSignInTime: firebaseUser.metadata?.lastSignInTime ?? null,
      authProvider: providerFromRecord(
        (firebaseUser.providerData ?? []).map((entry) => entry.providerId)
      ),
    };
  } catch {
    return { lastSignInTime: null, authProvider: null };
  }
}

async function getFirebaseLastSignInTime(uid: string): Promise<string | null> {
  return (await getFirebaseSignInFacts(uid)).lastSignInTime;
}

/** Whether Firebase Auth already holds this address, and under which provider.
 *  Returns null when no account exists. */
async function lookupFirebaseProvider(email: string): Promise<AuthProviderTag | null> {
  try {
    const authAdmin = await getFirebaseAuthAdmin();
    const firebaseUser = await authAdmin.getUserByEmail(email);
    return providerFromRecord(
      (firebaseUser.providerData ?? []).map((entry) => entry.providerId)
    );
  } catch {
    return null;
  }
}

/** Login-screen hint, called only after a password attempt has already failed.
 *
 *  Deliberately narrow: it answers 'google' for Google-linked accounts and
 *  'unknown' for everything else, so a password account and an address with no
 *  account are indistinguishable. That keeps the existing anti-enumeration
 *  stance for ordinary accounts while still letting the UI recover the one case
 *  where "Invalid email or password" is a dead end.
 */
export async function lookupSignInMethod(
  emailInput: string
): Promise<{ method: 'google' | 'unknown' }> {
  const provider = await lookupFirebaseProvider(normalizeEmail(emailInput));
  return { method: provider === 'google' ? 'google' : 'unknown' };
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  assertStrongPassword(input.password);

  try {
    // Checked before the Firestore lookup: a Google account created by signing
    // in (rather than by this endpoint) may have no profile document yet, so
    // the generic "already exists" would be the only thing the user ever saw.
    if ((await lookupFirebaseProvider(email)) === 'google') {
      throw httpError(409, GOOGLE_ONLY_SIGNUP_MESSAGE);
    }

    const existingEmail = await authUserRepository.getByEmail(email);
    if (existingEmail) {
      throw httpError(409, 'An account with this email already exists.');
    }

    const existingDisplayName = await authUserRepository.getByDisplayName(displayName);
    if (existingDisplayName) {
      throw httpError(409, 'This display name is already taken.');
    }

    const authAdmin = await getFirebaseAuthAdmin();
    const firebaseUser = await authAdmin.createUser({
      email,
      password: input.password,
      displayName,
      emailVerified: false,
    });
    const passwordHash = await bcrypt.hash(input.password, bcryptCost());
    const profile = await authUserRepository.createProfile({
      id: firebaseUser.uid,
      email,
      displayName,
      isVerified: false,
      passwordHash,
      authProvider: 'password',
    });
    const verification = await deliverVerificationEmail(
      email,
      displayName,
      SIGNUP_VERIFICATION_FAILURE_MESSAGE
    );

    return {
      uid: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      emailVerified: false,
      ...verification,
    };
  } catch (err) {
    if (isFirebaseDuplicateEmail(err)) {
      throw httpError(409, 'An account with this email already exists.');
    }
    throw err;
  }
}

export async function resendVerificationEmail(
  uid: string
): Promise<VerificationEmailResult> {
  const authAdmin = await getFirebaseAuthAdmin();
  const firebaseUser = await authAdmin.getUser(uid);
  if (firebaseUser.emailVerified) {
    return { verificationEmailSent: false, message: 'Email is already verified.' };
  }
  if (!firebaseUser.email) throw httpError(400, 'Account has no email address.');
  const profile = await authUserRepository.getById(uid);
  return deliverVerificationEmail(
    firebaseUser.email,
    profile?.displayName ?? firebaseUser.displayName ?? 'Sprout player',
    RESEND_VERIFICATION_FAILURE_MESSAGE
  );
}

/**
 * The requested display name, or the first free variant of it.
 *
 * Suffixes rather than rejects because this runs where no human is waiting to
 * retype: an auto-provisioned account is mid-sign-in. Bounded so a popular
 * prefix cannot turn one sign-in into an unbounded scan; past the bound the
 * uid is appended, which is unique by construction and ends the search.
 */
const MAX_DISPLAY_NAME_ATTEMPTS = 25;

export async function findFreeDisplayName(
  requested: string,
  uid?: string
): Promise<string> {
  const base = requested.trim() || 'player';
  if (!(await authUserRepository.getByDisplayName(base))) return base;

  for (let suffix = 2; suffix <= MAX_DISPLAY_NAME_ATTEMPTS; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!(await authUserRepository.getByDisplayName(candidate))) return candidate;
  }
  return uid ? `${base}-${uid.slice(0, 6)}` : `${base}-${Date.now().toString(36)}`;
}

export async function getCurrentUserProfile(
  uid: string,
  email: string | undefined,
  emailVerified: boolean | undefined
): Promise<PublicProfile> {
  const facts = await getFirebaseSignInFacts(uid);
  let profile = await authUserRepository.getById(uid);
  if (!profile) {
    const fallbackEmail = email ?? `${uid}@unknown.sprout`;
    // Signup rejects a display name someone already has; this path took the
    // email's local part and wrote it unchecked, so nat@gmail.com and
    // nat@outlook.com both became "nat" — two identical rows on the
    // leaderboard, and an almanac crediting a discovery to a name shared by
    // two people. Same rule both ways in now, except that nobody is here to
    // retype anything: a collision is resolved rather than refused.
    const requested = fallbackEmail.split('@')[0];
    const displayName = await findFreeDisplayName(requested);
    profile = await authUserRepository.createProfile({
      id: uid,
      email: normalizeEmail(fallbackEmail),
      displayName,
      isVerified: emailVerified === true,
      passwordHash: '',
      // Recorded only when it had to be changed, so the client can say so once
      // and then clear it. Nobody chose this name, so being told is the least
      // it is owed.
      ...(displayName === requested ? {} : { displayNameAdjustedFrom: requested }),
      ...(facts.authProvider ? { authProvider: facts.authProvider } : {}),
    });
  }
  if (emailVerified === true && !profile.isVerified) {
    await authUserRepository.markVerified(uid);
    profile = { ...profile, isVerified: true };
  }
  // This is where a Google takeover of a password account gets noticed: the
  // profile still says 'password', Firebase now reports google.com, and the
  // document is corrected rather than deleted. Deleting it would throw away the
  // archive, battle history and progression that hang off this uid — the
  // account is the same account, only the credential changed.
  if (facts.authProvider && profile.authProvider !== facts.authProvider) {
    await authUserRepository.setAuthProvider(uid, facts.authProvider);
    profile = { ...profile, authProvider: facts.authProvider };
  }
  if (facts.lastSignInTime) {
    profile =
      (await authUserRepository.recordLogin(uid, facts.lastSignInTime)) ?? profile;
  }
  return toPublicProfile(profile);
}

export async function recordUserLogin(uid: string): Promise<PublicProfile> {
  const lastSignInTime = await getFirebaseLastSignInTime(uid);
  const profile = await authUserRepository.recordLogin(uid, lastSignInTime);
  if (!profile) {
    throw httpError(404, 'User profile not found.');
  }
  return toPublicProfile(profile);
}

export async function recordUserLogout(uid: string): Promise<PublicProfile> {
  const profile = await authUserRepository.recordLogout(uid);
  if (!profile) {
    throw httpError(404, 'User profile not found.');
  }
  return toPublicProfile(profile);
}

export async function requestPasswordReset(emailInput: string): Promise<{ message: string }> {
  const email = normalizeEmail(emailInput);
  const profile = await authUserRepository.getByEmail(email);
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const resetOtpHash = await bcrypt.hash(otp, bcryptCost());
  const resetOtpExpiresAt = new Date(Date.now() + RESET_OTP_TTL_MS).toISOString();

  if (profile) {
    try {
      await authUserRepository.setResetOtp(profile.id, resetOtpHash, resetOtpExpiresAt);
      backgroundDispatcher.dispatch('password_reset_email_delivery_failed', () =>
        sendEmail({
          to: profile.email,
          subject: 'Your Sprout password reset code',
          text: `Your Sprout password reset code is ${otp}.\n\nIt expires in 15 minutes.\n`,
        }).then(() => undefined)
      );
    } catch {
      console.error('[auth] password_reset_state_write_failed');
    }
  }
  return { message: RESET_REQUEST_MESSAGE };
}

async function assertPasswordNotRecentlyUsed(
  profile: AuthUserProfile,
  newPassword: string
): Promise<Array<{ passwordHash: string }>> {
  const history = await authUserRepository.listPasswordHistory(
    profile.id,
    PASSWORD_HISTORY_KEEP
  );
  const hashes = [...new Set([
    profile.passwordHash,
    ...history.map((entry) => entry.passwordHash),
  ].filter((hash): hash is string => Boolean(hash)))];

  for (const hash of hashes) {
    if (await bcrypt.compare(newPassword, hash)) {
      throw httpError(400, 'This password was used recently. Choose a different password.');
    }
  }
  return history;
}

export async function verifyPasswordReset(
  emailInput: string,
  otp: string,
  newPassword: string
): Promise<{ message: string }> {
  const email = normalizeEmail(emailInput);
  const profile = await authUserRepository.getByEmail(email);
  if (!profile || !profile.resetOtpHash || !profile.resetOtpExpiresAt) {
    throw httpError(400, 'Invalid OTP.');
  }

  if (new Date(profile.resetOtpExpiresAt).getTime() <= Date.now()) {
    await authUserRepository.clearResetOtp(profile.id, profile.resetOtpHash);
    throw httpError(400, 'OTP has expired. Request a new one.');
  }

  const validOtp = await bcrypt.compare(otp, profile.resetOtpHash);
  if (!validOtp) {
    const failedAttempts = await authUserRepository.recordResetOtpFailure(
      profile.id,
      profile.resetOtpHash
    );
    if (failedAttempts >= 5) {
      throw httpError(400, 'Invalid OTP. Request a new one.');
    }
    throw httpError(400, 'Invalid OTP.');
  }

  assertStrongPassword(newPassword);
  const history = await assertPasswordNotRecentlyUsed(profile, newPassword);

  const newPasswordHash = await bcrypt.hash(newPassword, bcryptCost());
  const claimed = await authUserRepository.claimResetOtp(profile.id, profile.resetOtpHash);
  if (!claimed) {
    throw httpError(400, 'Invalid OTP. Request a new one.');
  }
  const authAdmin = await getFirebaseAuthAdmin();
  await authAdmin.updateUser(profile.id, { password: newPassword });
  if (
    profile.passwordHash &&
    !history.some((entry) => entry.passwordHash === profile.passwordHash)
  ) {
    await authUserRepository.addPasswordHistory(profile.id, profile.passwordHash);
  }
  await authUserRepository.updatePassword(profile.id, newPasswordHash);
  await authUserRepository.prunePasswordHistory(profile.id, PASSWORD_HISTORY_KEEP);

  return { message: 'Password reset successful.' };
}
