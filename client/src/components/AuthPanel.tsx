import { useEffect, useState, type FormEvent } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  getCurrentUser,
  listAvatarsWithToken,
  recordSessionLogin,
  recordSessionLogout,
  requestPasswordReset,
  signupUser,
  verifyPasswordReset,
  type AuthProfile,
  type PaginatedAvatars,
  type SignupResponse,
} from '../services/sproutApi';
import {
  getSproutFirebaseAuth,
  isFirebaseConfigured,
} from '../services/firebaseClient';
import { extractApiError } from '../services/apiClient';
import { mapFirebaseLoginError } from '../context/AuthContext';

const DEMO_EMAIL = 'demo@sprout.app';
const DEMO_PASSWORD = 'Password123!';
const TOKEN_STORAGE_KEY = 'sprout-auth-test-id-token';

function formatError(err: unknown): string {
  // Firebase SDK failures (login/refresh) carry an auth/* code — translate
  // them the same way the real login page does instead of showing raw codes.
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    String((err as { code?: unknown }).code).startsWith('auth/')
  ) {
    return mapFirebaseLoginError(err);
  }
  return extractApiError(err, 'Request failed.');
}

export default function AuthPanel() {
  const [signupEmail, setSignupEmail] = useState('designer-demo@sprout.app');
  const [signupPassword, setSignupPassword] = useState('Password123!');
  const [displayName, setDisplayName] = useState('Designer Demo');
  const [loginEmail, setLoginEmail] = useState(DEMO_EMAIL);
  const [loginPassword, setLoginPassword] = useState(DEMO_PASSWORD);
  const [resetEmail, setResetEmail] = useState(DEMO_EMAIL);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('Password123!!');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
  );
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [avatars, setAvatars] = useState<PaginatedAvatars | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getSproutFirebaseAuth();
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) return;
      const token = await user.getIdToken();
      setIdToken(token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    });
  }, []);

  async function runAction(label: string, action: () => Promise<string>) {
    setLoading(label);
    setError(null);
    setResult(null);
    try {
      setResult(await action());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(null);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    await runAction('signup', async () => {
      const res: SignupResponse = await signupUser({
        email: signupEmail,
        password: signupPassword,
        displayName,
      });
      return `${res.message}\nuid=${res.uid}\nemailVerified=${res.emailVerified}`;
    });
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    await runAction('login', async () => {
      const auth = getSproutFirebaseAuth();
      const cred = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      const token = await cred.user.getIdToken(true);
      const auditProfile = await recordSessionLogin(token);
      setFirebaseUser(cred.user);
      setIdToken(token);
      setProfile(auditProfile);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return `Signed in as ${cred.user.email}. Login event recorded: lastLogin=${auditProfile.lastLogin ?? 'null'}. Token stored for API tests.`;
    });
  }

  async function refreshToken() {
    await runAction('refresh-token', async () => {
      const auth = getSproutFirebaseAuth();
      if (!auth.currentUser) throw new Error('No Firebase user is signed in.');
      await auth.currentUser.reload();
      const token = await auth.currentUser.getIdToken(true);
      setFirebaseUser(auth.currentUser);
      setIdToken(token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return `Token refreshed. emailVerified=${auth.currentUser.emailVerified}`;
    });
  }

  async function handleLogout() {
    await runAction('logout', async () => {
      let auditProfile: AuthProfile | null = null;
      if (idToken) {
        auditProfile = await recordSessionLogout(idToken);
      }
      if (isFirebaseConfigured()) {
        await signOut(getSproutFirebaseAuth());
      }
      setFirebaseUser(null);
      setProfile(null);
      setAvatars(null);
      setIdToken('');
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return `Logout event recorded: lastLogout=${auditProfile?.lastLogout ?? 'not recorded'}. Signed out and cleared local token.`;
    });
  }

  async function recordLoginEvent() {
    await runAction('session-login', async () => {
      if (!idToken) throw new Error('Login first to get a Firebase ID token.');
      const data = await recordSessionLogin(idToken);
      setProfile(data);
      return `POST /api/auth/session/login wrote lastLogin=${data.lastLogin ?? 'null'}.`;
    });
  }

  async function recordLogoutEvent() {
    await runAction('session-logout', async () => {
      if (!idToken) throw new Error('Login first to get a Firebase ID token.');
      const data = await recordSessionLogout(idToken);
      setProfile(data);
      return `POST /api/auth/session/logout wrote lastLogout=${data.lastLogout ?? 'null'}.`;
    });
  }

  async function fetchMe() {
    await runAction('me', async () => {
      if (!idToken) throw new Error('Login first to get a Firebase ID token.');
      const data = await getCurrentUser(idToken);
      setProfile(data);
      return JSON.stringify(data, null, 2);
    });
  }

  async function fetchAvatars() {
    await runAction('avatars-token', async () => {
      if (!idToken) throw new Error('Login first to get a Firebase ID token.');
      const data = await listAvatarsWithToken(idToken);
      setAvatars(data);
      return `Fetched ${data.total} avatar(s) using Authorization: Bearer <idToken>.`;
    });
  }

  async function handleRequestReset() {
    await runAction('request-reset', async () => {
      const res = await requestPasswordReset(resetEmail);
      return res.message;
    });
  }

  async function handleVerifyReset(e: FormEvent) {
    e.preventDefault();
    await runAction('verify-reset', async () => {
      const res = await verifyPasswordReset({
        email: resetEmail,
        otp,
        newPassword,
      });
      setLoginEmail(resetEmail);
      setLoginPassword(newPassword);
      return `${res.message}\nLogin password field updated to the new password.`;
    });
  }

  const firebaseReady = isFirebaseConfigured();

  return (
    // `panel-flow` marks this as the wide member of .test-layout: four
    // sub-procedures need roughly twice the width of the single-form panels.
    <section className="panel panel-flow">
      <div className="panel-head">
        <h2>Firebase auth flow</h2>
        <span className="endpoint">Authorization: Bearer &lt;idToken&gt;</span>
      </div>
      <p className="panel-hint">
        Signup and password reset go through the Express backend; login uses the
        Firebase JS SDK. The steps run in order — step 3 spends the ID token
        step 2 stores.
      </p>

      {!firebaseReady && (
        <div className="result result-err">
          Missing Firebase web config. Fill <code>client/.env.local</code> with
          the <code>VITE_FIREBASE_*</code> values before testing login.
        </div>
      )}

      {/* Four steps as ruled sections, not four cards. A card inside a card
          inside a grid column was the old shape and it read as debris. */}
      <div className="flow-steps">
        <form onSubmit={handleSignup} className="flow-step">
          <h3>
            <span className="step-index">1</span>Create account
          </h3>
          <label>
            Email
            <input
              type="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="primary-cta form-submit"
            disabled={loading === 'signup'}
          >
            {loading === 'signup' ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <form onSubmit={handleLogin} className="flow-step">
          <h3>
            <span className="step-index">2</span>Sign in
          </h3>
          <label>
            Email
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="primary-cta form-submit"
            disabled={!firebaseReady || loading === 'login'}
          >
            {loading === 'login' ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="secondary-cta form-submit"
            onClick={refreshToken}
            disabled={!firebaseReady}
          >
            Refresh token
          </button>
          <button
            type="button"
            className="secondary-cta form-submit"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </form>

        <div className="flow-step">
          <h3>
            <span className="step-index">3</span>Protected calls
          </h3>
          <p className="readout">
            <span className="readout-key">Signed in</span>
            {/* An absence is not a record: the fallback drops out of the mono
                face so it cannot be mistaken for something the server said. */}
            {firebaseUser?.email ? (
              <span className="readout-value">{firebaseUser.email}</span>
            ) : (
              <span className="readout-value is-empty">
                nobody yet — complete step 2
              </span>
            )}
          </p>
          {/* Method and path, in mono. These are strings the caller has to
              match exactly, so they are shown as the record they are rather
              than paraphrased into a sentence. */}
          <div className="endpoint-list">
            <button
              type="button"
              className="endpoint-button"
              onClick={fetchMe}
              disabled={!idToken}
            >
              {/* The space is for the accessible name — grid drops
                  whitespace-only nodes, so it costs nothing visually but stops
                  the button announcing as "GETslashapislashauthslashme". */}
              <span className="method">GET</span>{' '}
              <span className="path">/api/auth/me</span>
            </button>
            <button
              type="button"
              className="endpoint-button"
              onClick={recordLoginEvent}
              disabled={!idToken}
            >
              <span className="method">POST</span>{' '}
              <span className="path">/api/auth/session/login</span>
            </button>
            <button
              type="button"
              className="endpoint-button"
              onClick={recordLogoutEvent}
              disabled={!idToken}
            >
              <span className="method">POST</span>{' '}
              <span className="path">/api/auth/session/logout</span>
            </button>
            <button
              type="button"
              className="endpoint-button"
              onClick={fetchAvatars}
              disabled={!idToken}
            >
              <span className="method">GET</span>{' '}
              <span className="path">/api/avatar</span>
            </button>
          </div>
          {profile && (
            <p className="readout">
              <span className="readout-key">Profile</span>
              <span className="readout-value">
                {profile.displayName} · verified {String(profile.emailVerified)}
              </span>
            </p>
          )}
          {avatars && (
            <p className="readout">
              <span className="readout-key">With token</span>
              <span className="readout-value">{avatars.total} avatar(s)</span>
            </p>
          )}
        </div>

        <form onSubmit={handleVerifyReset} className="flow-step">
          <h3>
            <span className="step-index">4</span>Password reset
          </h3>
          <label>
            Email
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
          </label>
          <button
            type="button"
            className="secondary-cta form-submit"
            onClick={handleRequestReset}
            disabled={loading === 'request-reset'}
          >
            Request OTP
          </button>
          <label>
            OTP from email
            <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="primary-cta form-submit"
            disabled={loading === 'verify-reset'}
          >
            {loading === 'verify-reset' ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>

      {error && <div className="result result-err">{error}</div>}
      {result && <div className="result result-ok">{result}</div>}
    </section>
  );
}
