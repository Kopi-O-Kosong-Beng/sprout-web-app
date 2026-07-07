/** Firebase Auth middleware — verifies the ID token the frontend obtains from
 *  the Firebase JS SDK sign-in and sends as `Authorization: Bearer <idToken>`.
 *  Attaches the decoded token as req.user ({ uid, email, email_verified, ... }).
 *
 *  Frontend contract (for the client team):
 *    1. signInWithEmailAndPassword / signInWithPopup via Firebase JS SDK
 *    2. const idToken = await user.getIdToken()
 *    3. axios.defaults.headers.Authorization = `Bearer ${idToken}`
 */
const { getAdmin } = require('../firebase');

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }
  try {
    req.user = await getAdmin().auth().verifyIdToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }
};
