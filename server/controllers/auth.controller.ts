import type { RequestHandler } from 'express';
import {
  getCurrentUserProfile,
  recordUserLogin,
  recordUserLogout,
  resendVerificationEmail,
  requestPasswordReset,
  signup,
  verifyPasswordReset,
  type PublicProfile,
} from '../services/auth.service';
import { isAdminEmail, isSuperAdminEmail } from '../middleware/admin.middleware';

export interface ProfileResponse extends PublicProfile {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/** The frontend has to know whether to route this account to the admin
 *  dashboard and show the operator nav links, and it cannot compute that
 *  itself: membership lives in the server's ADMIN_EMAILS / SUPER_ADMIN_EMAILS
 *  allowlists.
 *
 *  Attached here rather than stored on the user document, so revoking an admin
 *  stays a config edit — a persisted flag would have to be migrated instead.
 *  Both flags are advisory only: /api/admin and /api/platform re-check the
 *  allowlists on every request, so a forged flag buys nothing but a dashboard
 *  that answers 403.
 */
function withAdminFlag(
  profile: PublicProfile,
  email: string | undefined
): ProfileResponse {
  return {
    ...profile,
    isAdmin: isAdminEmail(email),
    isSuperAdmin: isSuperAdminEmail(email),
  };
}

export const handleSignup: RequestHandler = async (req, res, next) => {
  try {
    const result = await signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const handleResendVerification: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await resendVerificationEmail(req.user!.uid));
  } catch (err) {
    next(err);
  }
};

export const handleMe: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await getCurrentUserProfile(
      user.uid,
      user.email,
      user.emailVerified
    );
    res.status(200).json(withAdminFlag(profile, user.email));
  } catch (err) {
    next(err);
  }
};

export const handleSessionLogin: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await recordUserLogin(user.uid);
    res.status(200).json(withAdminFlag(profile, user.email));
  } catch (err) {
    next(err);
  }
};

export const handleSessionLogout: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await recordUserLogout(user.uid);
    res.status(200).json(withAdminFlag(profile, user.email));
  } catch (err) {
    next(err);
  }
};

export const handleRequestReset: RequestHandler = async (req, res, next) => {
  try {
    const result = await requestPasswordReset(req.body.email);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const handleVerifyReset: RequestHandler = async (req, res, next) => {
  try {
    const result = await verifyPasswordReset(
      req.body.email,
      req.body.otp,
      req.body.newPassword
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
