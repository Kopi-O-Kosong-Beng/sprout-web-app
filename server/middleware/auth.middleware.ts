/** Firebase Auth middleware — verifies the ID token the frontend obtains from
 *  the Firebase JS SDK sign-in and sends as `Authorization: Bearer <idToken>`.
 *  On success attaches req.user with the caller's uid (+ decoded claims).
 *
 *  Frontend contract (for the client team):
 *    1. signInWithEmailAndPassword / signInWithPopup via Firebase JS SDK
 *    2. const idToken = await user.getIdToken()
 *    3. send header:  Authorization: Bearer <idToken>
 *
 *  DEV ESCAPE HATCH (local only): if AUTH_DEV_BYPASS=true in server/.env, a
 *  request may instead send `x-dev-uid: <someUserId>` to act as that user.
 *
 *  DEMO ESCAPE HATCH (temporary deploys only): if DEMO_AUTH_BYPASS=true, the
 *  same header may stand in for DEMO_AUTH_BYPASS_USER_ID only. Keep this false
 *  once real Firebase login is wired up.
 */
import type { RequestHandler } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

interface AuthMiddlewareOptions {
  allowUnverifiedEmail?: boolean;
  allowBypass?: boolean;
}

function createAuthMiddleware(options: AuthMiddlewareOptions = {}): RequestHandler {
  const allowBypass = options.allowBypass ?? true;
  return async (req, res, next) => {
    const devUid = req.header('x-dev-uid');

    // Local-only bypass so the frontend can exercise protected routes pre-auth.
    if (
      allowBypass &&
      process.env.AUTH_DEV_BYPASS === 'true' &&
      process.env.NODE_ENV !== 'production' &&
      devUid
    ) {
      req.user = { uid: devUid };
      next();
      return;
    }

    // Temporary deployed-demo bypass, restricted to the seeded demo account.
    if (allowBypass && process.env.DEMO_AUTH_BYPASS === 'true' && devUid) {
      const demoUid = process.env.DEMO_AUTH_BYPASS_USER_ID ?? 'demo-user-0001';
      if (devUid === demoUid) {
        req.user = { uid: demoUid };
        next();
        return;
      }
    }

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Unauthorised.' });
      return;
    }

    try {
      // Lazy import so SQLite/test processes never load firebase-admin.
      const { getAuthAdmin } = await import('../firebase');
      const decoded: DecodedIdToken = await getAuthAdmin().verifyIdToken(token);
      if (
        !options.allowUnverifiedEmail &&
        decoded.email_verified !== true
      ) {
        res.status(403).json({ error: 'Email is not verified.' });
        return;
      }
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
      };
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorised.' });
    }
  };
}

const authMiddleware = createAuthMiddleware();

export const unverifiedAuthMiddleware = createAuthMiddleware({
  allowUnverifiedEmail: true,
});

export const strictUnverifiedAuthMiddleware = createAuthMiddleware({
  allowUnverifiedEmail: true,
  allowBypass: false,
});

export default authMiddleware;
