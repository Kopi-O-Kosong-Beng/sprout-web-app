/** Firebase Auth middleware — verifies the ID token the frontend obtains from
 *  the Firebase JS SDK sign-in and sends as `Authorization: Bearer <idToken>`.
 *  Attaches the decoded token as req.user ({ uid, email, email_verified, ... }).
 *
 *  Frontend contract (for the client team):
 *    1. signInWithEmailAndPassword / signInWithPopup via Firebase JS SDK
 *    2. const idToken = await user.getIdToken()
 *    3. axios.defaults.headers.Authorization = `Bearer ${idToken}`
 */
import type { RequestHandler } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAuthAdmin } from '../firebase';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: DecodedIdToken;
    }
  }
}

const authMiddleware: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }
  try {
    req.user = await getAuthAdmin().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorised.' });
  }
};

export default authMiddleware;
