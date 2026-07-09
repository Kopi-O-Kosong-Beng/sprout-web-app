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

const DEMO_EMAIL = 'demo@sprout.app';
const DEMO_PASSWORD = 'Password123!';
const TOKEN_STORAGE_KEY = 'sprout-auth-test-id-token';

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
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
      setFirebaseUser(cred.user);
      setIdToken(token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return `Signed in as ${cred.user.email}. Token stored for API tests.`;
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
      if (isFirebaseConfigured()) {
        await signOut(getSproutFirebaseAuth());
      }
      setFirebaseUser(null);
      setProfile(null);
      setAvatars(null);
      setIdToken('');
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return 'Signed out and cleared local token.';
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
      return `${res.message}\nRead the 6-digit OTP from the backend EMAIL_MODE=console log.`;
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
            OTP from backend log
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
