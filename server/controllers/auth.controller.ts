import type { RequestHandler } from 'express';
import {
  getCurrentUserProfile,
  lookupSignInMethod,
  recordUserLogin,
  recordUserLogout,
  resendVerificationEmail,
  requestPasswordReset,
  signup,
  verifyPasswordReset,
  type PublicProfile,
} from '../services/auth.service';
import { resolveSuperAdmin } from '../middleware/admin.middleware';

export interface ProfileResponse extends PublicProfile {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/** The frontend has to know whether to show the operator nav — Studio, API
 *  Test, Ticket Manager, Admin — and it cannot compute that itself: the grant
 *  is the Firestore flag OR the server's ADMIN_EMAILS allowlist, and the
 *  allowlist is never sent to the client.
 *
 *  Advisory only. Every /api/admin and /api/platform request re-resolves the
 *  grant server-side, so a forged flag in the browser buys nothing but a
 *  dashboard that answers 403.
 *
 *  `isAdmin` is kept as an alias of the same value so existing callers and
 *  tests keep working; there is one privilege level, not two.
 */
async function withAdminFlag(
  profile: PublicProfile,
  uid: string,
  email: string | undefined
): Promise<ProfileResponse> {
  const isSuperAdmin = await resolveSuperAdmin(uid, email);
  return { ...profile, isAdmin: isSuperAdmin, isSuperAdmin };
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

/** Unauthenticated by necessity — the caller could not sign in, which is the
 *  whole reason they need the hint. Rate limited on the route. */
export const handleSignInMethod: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await lookupSignInMethod(req.body.email));
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
    res.status(200).json(await withAdminFlag(profile, user.uid, user.email));
  } catch (err) {
    next(err);
  }
};

export const handleSessionLogin: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await recordUserLogin(user.uid);
    res.status(200).json(await withAdminFlag(profile, user.uid, user.email));
  } catch (err) {
    next(err);
  }
};

export const handleSessionLogout: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await recordUserLogout(user.uid);
    res.status(200).json(await withAdminFlag(profile, user.uid, user.email));
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
