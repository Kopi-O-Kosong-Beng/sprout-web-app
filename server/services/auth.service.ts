import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import authUserRepository from '../repositories/auth-users';
import { send as sendEmail } from './email.service';
import type { AuthUserProfile } from '../models/auth';

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
  if (
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw httpError(
      400,
      'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.'
    );
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
  } catch {
    console.error('[auth] verification email delivery failed');
    return {
      verificationEmailSent: false,
      message: failureMessage,
    };
  }
}

async function getFirebaseLastSignInTime(uid: string): Promise<string | null> {
  try {
    const authAdmin = await getFirebaseAuthAdmin();
    const firebaseUser = await authAdmin.getUser(uid);
    return firebaseUser.metadata?.lastSignInTime ?? null;
  } catch {
    return null;
  }
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  assertStrongPassword(input.password);

  try {
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

export async function getCurrentUserProfile(
  uid: string,
  email: string | undefined,
  emailVerified: boolean | undefined
): Promise<PublicProfile> {
  let profile = await authUserRepository.getById(uid);
  if (!profile) {
    const fallbackEmail = email ?? `${uid}@unknown.sprout`;
    profile = await authUserRepository.createProfile({
      id: uid,
      email: normalizeEmail(fallbackEmail),
      displayName: fallbackEmail.split('@')[0],
      isVerified: emailVerified === true,
      passwordHash: '',
    });
  }
  if (emailVerified === true && !profile.isVerified) {
    await authUserRepository.markVerified(uid);
    profile = { ...profile, isVerified: true };
  }
  const lastSignInTime = await getFirebaseLastSignInTime(uid);
  if (lastSignInTime) {
    profile = (await authUserRepository.recordLogin(uid, lastSignInTime)) ?? profile;
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
  if (!profile) {
    return { message: RESET_REQUEST_MESSAGE };
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const resetOtpHash = await bcrypt.hash(otp, bcryptCost());
  const resetOtpExpiresAt = new Date(Date.now() + RESET_OTP_TTL_MS).toISOString();

  await authUserRepository.setResetOtp(profile.id, resetOtpHash, resetOtpExpiresAt);
  await sendEmail({
    to: profile.email,
    subject: 'Your Sprout password reset code',
    text: `Your Sprout password reset code is ${otp}.\n\nIt expires in 15 minutes.\n`,
  });
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
