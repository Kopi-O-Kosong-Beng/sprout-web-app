import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import authUserRepository from '../repositories/auth-users';
import { send as sendEmail } from './email.service';
import type { AuthUserProfile } from '../models/auth';

const BCRYPT_COST = 12;
const RESET_OTP_TTL_MS = 15 * 60 * 1000;
const PASSWORD_HISTORY_KEEP = 3;
const RESET_REQUEST_MESSAGE = 'If an account exists, a reset code has been sent.';

interface HttpError extends Error {
  status?: number;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
}

export interface SignupResult {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  message: string;
}

export interface PublicProfile {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
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
  };
}

async function getFirebaseAuthAdmin() {
  const { getAuthAdmin } = await import('../firebase');
  return getAuthAdmin();
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  assertStrongPassword(input.password);

  try {
    const authAdmin = await getFirebaseAuthAdmin();
    const firebaseUser = await authAdmin.createUser({
      email,
      password: input.password,
      displayName,
      emailVerified: false,
    });
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const profile = await authUserRepository.createProfile({
      id: firebaseUser.uid,
      email,
      displayName,
      isVerified: false,
      passwordHash,
    });
    await authUserRepository.addPasswordHistory(profile.id, passwordHash);
    await authUserRepository.prunePasswordHistory(profile.id, PASSWORD_HISTORY_KEEP);

    const link = await authAdmin.generateEmailVerificationLink(email);
    await sendEmail({
      to: email,
      subject: 'Verify your Sprout account',
      text: `Welcome to Sprout, ${displayName}!\n\nOpen this link to verify your email:\n${link}\n`,
    });

    return {
      uid: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      emailVerified: false,
      message: 'Account created. Check the backend email log for the verification link.',
    };
  } catch (err) {
    if (isFirebaseDuplicateEmail(err)) {
      throw httpError(409, 'An account with this email already exists.');
    }
    throw err;
  }
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
  return toPublicProfile(profile);
}

export async function requestPasswordReset(emailInput: string): Promise<{ message: string }> {
  const email = normalizeEmail(emailInput);
  const profile = await authUserRepository.getByEmail(email);
  if (!profile) {
    return { message: RESET_REQUEST_MESSAGE };
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const resetOtpHash = await bcrypt.hash(otp, BCRYPT_COST);
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
): Promise<void> {
  const history = await authUserRepository.listPasswordHistory(
    profile.id,
    PASSWORD_HISTORY_KEEP
  );
  const hashes = [
    profile.passwordHash,
    ...history.map((entry) => entry.passwordHash),
  ].filter((hash): hash is string => Boolean(hash));

  for (const hash of hashes) {
    if (await bcrypt.compare(newPassword, hash)) {
      throw httpError(400, 'This password was used recently. Choose a different password.');
    }
  }
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
    await authUserRepository.setResetOtp(profile.id, null, null);
    throw httpError(400, 'OTP has expired. Request a new one.');
  }

  const validOtp = await bcrypt.compare(otp, profile.resetOtpHash);
  if (!validOtp) {
    throw httpError(400, 'Invalid OTP.');
  }

  assertStrongPassword(newPassword);
  await assertPasswordNotRecentlyUsed(profile, newPassword);

  const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const authAdmin = await getFirebaseAuthAdmin();
  await authAdmin.updateUser(profile.id, { password: newPassword });
  if (profile.passwordHash) {
    await authUserRepository.addPasswordHistory(profile.id, profile.passwordHash);
  }
  await authUserRepository.updatePasswordAndClearOtp(profile.id, newPasswordHash);
  await authUserRepository.prunePasswordHistory(profile.id, PASSWORD_HISTORY_KEEP);

  return { message: 'Password reset successful.' };
}
