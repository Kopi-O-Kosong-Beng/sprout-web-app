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
 *  request may instead send `x-dev-uid: <someUserId>` to act as that user
 *  WITHOUT a real Firebase token. This lets the frontend test protected
 *  endpoints before Firebase sign-in is wired up. It is IGNORED when
 *  NODE_ENV=production. Never enable it in a deployed environment.
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

const authMiddleware: RequestHandler = async (req, res, next) => {
  // Dev-only bypass so the frontend can exercise protected routes pre-auth.
  if (process.env.AUTH_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
    const devUid = req.header('x-dev-uid');
    if (devUid) {
      req.user = { uid: devUid };
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

export default authMiddleware;
