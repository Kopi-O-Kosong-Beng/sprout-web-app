/** Superadmin gate for the operator tools — Studio, API Test, Ticket Manager
 *  and the account dashboard.
 *
 *  Layered on top of the normal Firebase auth middleware, never instead of it:
 *  a caller must already hold a valid, verified ID token before either grant
 *  is even considered.
 *
 *  Two ways to hold the grant, see resolveSuperAdmin below:
 *    1. `isSuperAdmin: true` on the caller's Firestore `users` document — the
 *       normal path, managed from the dashboard.
 *    2. The ADMIN_EMAILS allowlist — break-glass, for when the database the
 *       flag lives in is the thing that needs repairing.
 *
 *  ADMIN_EMAILS is a comma-separated list, compared case-insensitively:
 *    ADMIN_EMAILS=hello.sprout.team@gmail.com,teammate@gmail.com
 *
 *  An unset or empty list grants nobody by itself. That fail-closed default
 *  matters: a misconfigured deploy must not silently expose account deletion.
 */
import type { RequestHandler } from 'express';
import authUserRepository from '../repositories/auth-users';

function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * The break-glass allowlist, read from ADMIN_EMAILS.
 *
 * SUPER_ADMIN_EMAILS is still honoured because it is the name every already
 * deployed environment sets. Before this tier existed that variable was the
 * only authority on /api/admin and /api/platform, and dropping it would have
 * meant a deploy where the new flag is not set on anybody yet, ADMIN_EMAILS is
 * empty (it shipped empty and gated nothing), and the allowlist that exists to
 * survive a broken database is itself the thing that is empty — nobody able to
 * reach the dashboard that grants the flag.
 *
 * Reading both is not a widening: ADMIN_EMAILS gated no route before this
 * change, so no address gains authority it did not already have. Retire the
 * fallback once every environment has been moved over.
 */
export function adminEmailAllowlist(): string[] {
  return [
    ...parseEmailList(process.env.ADMIN_EMAILS),
    ...parseEmailList(process.env.SUPER_ADMIN_EMAILS),
  ];
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return adminEmailAllowlist().includes(email.trim().toLowerCase());
}

/**
 * Superadmin resolution: the Firestore flag is the normal path, the
 * ADMIN_EMAILS allowlist is break-glass.
 *
 * The flag is what the team actually manages day to day — promote and revoke
 * are a click in the dashboard, effective on the operator's next request. The
 * allowlist stays because that flag lives in the same database the tools are
 * used to repair: a bad write, a restored backup or an emptied `users`
 * collection would otherwise leave nobody able to reach the dashboard that
 * fixes it. Deployment config cannot be damaged from inside the app, so it is
 * the one grant that always survives.
 *
 * OR, not AND — either alone is sufficient. Both halves fail closed: an unset
 * allowlist grants nobody, and a missing or malformed flag is not `true`.
 */
export async function resolveSuperAdmin(
  uid: string | undefined,
  email: string | undefined
): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  if (!uid) return false;
  try {
    const profile = await authUserRepository.getById(uid);
    return profile?.isSuperAdmin === true;
  } catch {
    // A Firestore read failure must not be mistaken for a grant.
    console.error('[admin] superadmin_flag_lookup_failed');
    return false;
  }
}

/** Requires req.user to be populated by authMiddleware first. */
const requireSuperAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }
  void resolveSuperAdmin(req.user.uid, req.user.email)
    .then((allowed) => {
      if (!allowed) {
        // Deliberately identical to any other forbidden response: never confirm
        // whether an allowlist exists, who is on it, or who holds the flag.
        res.status(403).json({ error: 'Admin access required.' });
        return;
      }
      next();
    })
    .catch(next);
};

export default requireSuperAdmin;
