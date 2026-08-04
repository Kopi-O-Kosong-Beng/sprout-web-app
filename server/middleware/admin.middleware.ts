/** Admin gates for the account-management and platform endpoints.
 *
 *  Layered on top of the normal Firebase auth middleware, never instead of it:
 *  a caller must already hold a valid, verified ID token, and the token's email
 *  must appear in the relevant allowlist. Membership therefore lives in
 *  deployment config, so revoking an admin is a dashboard edit with no deploy
 *  and no schema change.
 *
 *  Two tiers, each a comma-separated list compared case-insensitively:
 *    ADMIN_EMAILS=teammate@gmail.com
 *    SUPER_ADMIN_EMAILS=hello.sprout.team@gmail.com
 *
 *  Super admins are the operators: they hold everything an admin holds plus
 *  the operations surfaces (account dashboard, studio platform tools). A super
 *  admin never needs to appear in both lists — isAdminEmail treats the super
 *  list as a superset, so promoting someone is a one-line config move.
 *
 *  An unset or empty list denies everyone. That fail-closed default matters:
 *  a misconfigured deploy must not silently expose account deletion.
 */
import type { RequestHandler } from 'express';

function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function adminEmailAllowlist(): string[] {
  return parseEmailList(process.env.ADMIN_EMAILS);
}

export function superAdminEmailAllowlist(): string[] {
  return parseEmailList(process.env.SUPER_ADMIN_EMAILS);
}

export function isSuperAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return superAdminEmailAllowlist().includes(email.trim().toLowerCase());
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return (
    adminEmailAllowlist().includes(email.trim().toLowerCase()) ||
    isSuperAdminEmail(email)
  );
}

/** Requires req.user to be populated by authMiddleware first. */
const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }
  if (!isAdminEmail(req.user.email)) {
    // Deliberately identical to any other forbidden response: never confirm
    // whether an allowlist exists or who is on it.
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
};

/** Same contract as requireAdmin, but only the super-admin list passes. The
 *  403 body matches requireAdmin's exactly so a response never reveals that a
 *  second tier exists, let alone who is on it. */
export const requireSuperAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }
  if (!isSuperAdminEmail(req.user.email)) {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
};

export default requireAdmin;
