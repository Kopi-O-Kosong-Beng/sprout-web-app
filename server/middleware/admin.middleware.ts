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
 *    2. The break-glass allowlist — for when the database the flag lives in is
 *       the thing that needs repairing.
 *
 *  An unset or empty allowlist grants nobody by itself. That fail-closed
 *  default matters: a misconfigured deploy must not silently expose account
 *  deletion.
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
 * Two allowlists, and the distinction between them is load-bearing.
 *
 * SUPER_ADMIN_EMAILS is the break-glass operator grant. ADMIN_EMAILS is
 * advisory — a badge in the accounts table, opening no surface on its own.
 *
 * This branch forked before that split, when ADMIN_EMAILS was the only
 * authority, and built the Firestore flag on top of it. Folding the two names
 * together on the merge would have promoted every advisory address on a
 * deployed environment to a full operator, so they stay separate and
 * SUPER_ADMIN_EMAILS keeps the meaning main gave it. The flag is added
 * alongside, not instead: see resolveSuperAdmin.
 */
export function adminEmailAllowlist(): string[] {
  return parseEmailList(process.env.ADMIN_EMAILS);
}

export function superAdminEmailAllowlist(): string[] {
  return parseEmailList(process.env.SUPER_ADMIN_EMAILS);
}

/** The break-glass half of the operator grant. */
export function isSuperAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return superAdminEmailAllowlist().includes(email.trim().toLowerCase());
}

/** Advisory tier. An operator counts as an admin everywhere, so the super list
 *  is a superset and nobody has to appear in both. */
export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return (
    adminEmailAllowlist().includes(email.trim().toLowerCase()) ||
    isSuperAdminEmail(email)
  );
}

/**
 * Superadmin resolution: the Firestore flag is the normal path,
 * SUPER_ADMIN_EMAILS is break-glass.
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
  if (isSuperAdminEmail(email)) return true;
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

// Named as well as default: main's routes import the named binding, this
// branch's import the default, and both spellings survive the merge.
export { requireSuperAdmin };
export default requireSuperAdmin;
