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
    <section className="panel">
      <h2>Firebase Auth test flow</h2>
      <p className="panel-hint">
        Reference UX for designers. Signup/reset go through the Express backend;
        login uses the Firebase JS SDK; protected API tests send{' '}
        <code>Authorization: Bearer &lt;idToken&gt;</code>.
      </p>

      {!firebaseReady && (
        <div className="result result-err">
          Missing Firebase web config. Fill <code>client/.env.local</code> with
          the <code>VITE_FIREBASE_*</code> values before testing login.
        </div>
      )}

      <div className="auth-grid">
        <form onSubmit={handleSignup} className="auth-card">
          <h3>1. Signup</h3>
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
          <button type="submit" disabled={loading === 'signup'}>
            {loading === 'signup' ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <form onSubmit={handleLogin} className="auth-card">
          <h3>2. Login</h3>
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
          <button type="submit" disabled={!firebaseReady || loading === 'login'}>
            {loading === 'login' ? 'Signing in...' : 'Sign in with Firebase'}
          </button>
          <button type="button" onClick={refreshToken} disabled={!firebaseReady}>
            Refresh token
          </button>
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </form>

        <div className="auth-card">
          <h3>3. Protected API tests</h3>
          <p className="panel-hint">
            Current Firebase user:{' '}
            <strong>{firebaseUser?.email ?? 'not signed in'}</strong>
          </p>
          <button type="button" onClick={fetchMe} disabled={!idToken}>
            GET /api/auth/me
          </button>
          <button type="button" onClick={recordLoginEvent} disabled={!idToken}>
            POST /api/auth/session/login
          </button>
          <button type="button" onClick={recordLogoutEvent} disabled={!idToken}>
            POST /api/auth/session/logout
          </button>
          <button type="button" onClick={fetchAvatars} disabled={!idToken}>
            GET /api/avatar with token
          </button>
          {profile && (
            <p className="panel-hint">
              Profile: {profile.displayName} - verified:{' '}
              {String(profile.emailVerified)}
            </p>
          )}
          {avatars && (
            <p className="panel-hint">
              Token avatar fetch returned {avatars.total} avatar(s).
            </p>
          )}
        </div>

        <form onSubmit={handleVerifyReset} className="auth-card">
          <h3>4. Password reset</h3>
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
          <button type="submit" disabled={loading === 'verify-reset'}>
            Verify OTP + reset password
          </button>
        </form>
      </div>

      {error && <div className="result result-err">{error}</div>}
      {result && <div className="result result-ok">{result}</div>}
    </section>
  );
}
