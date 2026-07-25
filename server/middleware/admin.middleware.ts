/** Admin gate for the account-management endpoints.
 *
 *  Layered on top of the normal Firebase auth middleware, never instead of it:
 *  a caller must already hold a valid, verified ID token, and the token's email
 *  must appear in the ADMIN_EMAILS allowlist. Membership therefore lives in
 *  deployment config, so revoking an admin is a dashboard edit with no deploy
 *  and no schema change.
 *
 *  ADMIN_EMAILS is a comma-separated list, compared case-insensitively:
 *    ADMIN_EMAILS=hello.sprout.team@gmail.com,teammate@gmail.com
 *
 *  An unset or empty list denies everyone. That fail-closed default matters:
 *  a misconfigured deploy must not silently expose account deletion.
 */
import type { RequestHandler } from 'express';

export function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return adminEmailAllowlist().includes(email.trim().toLowerCase());
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

export default requireAdmin;
