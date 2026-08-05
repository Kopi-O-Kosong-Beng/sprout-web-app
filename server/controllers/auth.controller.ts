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
import { isAdminEmail, resolveSuperAdmin } from '../middleware/admin.middleware';

export interface ProfileResponse extends PublicProfile {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/** The frontend has to know whether to show the operator nav — Studio, API
 *  Test, Ticket Manager, Admin — and it cannot compute that itself: the grant
 *  is the Firestore flag OR the server's SUPER_ADMIN_EMAILS allowlist, and
 *  neither is sent to the client.
 *
 *  Two values, because there are still two tiers. `isSuperAdmin` is the one
 *  that opens anything; `isAdmin` stays the advisory badge ADMIN_EMAILS grants,
 *  with an operator counting as an admin everywhere.
 *
 *  Both advisory in the browser: every /api/admin and /api/platform request
 *  re-resolves the grant server-side, so a forged flag in devtools buys nothing
 *  but a dashboard that answers 403.
 */
async function withAdminFlag(
  profile: PublicProfile,
  uid: string,
  email: string | undefined
): Promise<ProfileResponse> {
  const isSuperAdmin = await resolveSuperAdmin(uid, email);
  return { ...profile, isAdmin: isAdminEmail(email) || isSuperAdmin, isSuperAdmin };
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
