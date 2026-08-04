import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { requestPasswordReset, verifyPasswordReset } from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { getPasswordCriteria, isStrongPassword } from '../utils/validation';
import { MiniArchive } from '../components/common/PlantVisuals';

type Mode = 'login' | 'reset-request' | 'reset-verify';

export default function LoginPage() {
  const { status, profile, login, loginWithGoogle } = useAuth();
  const location = useLocation();
  // Set by ProtectedRoute when it bounced someone off a page they asked for.
  const bouncedFrom = (location.state as { from?: string } | null)?.from ?? null;

  /** Where a successful login lands.
   *
   *  A bounce always wins — being sent back to the page you were trying to
   *  reach beats any default, admin or not.
   *
   *  Otherwise the two audiences split: operators run the account dashboard,
   *  and players go to the in-game hub rather than back to `/`, the public
   *  landing page they just came through. Signed-out visitors still enter at
   *  `/`; this only decides where the door leads once you are through it.
   *  /admin is super-admin territory now, so only that tier lands there — a
   *  plain admin sent to /admin would just be bounced by the route guard.
   *
   *  profile is null for the moment after a transient /api/auth/me failure, in
   *  which case this falls to /home and the Admin nav link (same isSuperAdmin
   *  flag) is how an operator gets across. It is not a security boundary either
   *  way — the server re-checks SUPER_ADMIN_EMAILS on every /api/admin call.
   */
  const from = bouncedFrom ?? (profile?.isSuperAdmin ? '/admin' : '/home');

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('demo@sprout.app');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const criteria = getPasswordCriteria(newPassword);
  const otpValid = /^\d{6}$/.test(otp);
  const passwordsMatch = newPassword === confirm;

  // Already signed in (Firebase session exists) — don't let this render the
  // login form again; only a logout should bring the user back here.
  //
  // `busy` holds the redirect while a sign-in this page started is still
  // running. Firebase fires onAuthStateChanged the moment signInWithPopup
  // resolves, which is before loginWithGoogle has recorded the session — so
  // without this guard the Google flow navigated away mid-sequence, unmounting
  // the page while its own request was in flight and taking any error message
  // with it. The guard is presentational only; ProtectedRoute is the gate.
  if (status === 'unverified' && !busy) {
    return <Navigate to="/verify-email" state={{ from }} replace />;
  }
  if (status === 'authenticated' && !busy) {
    return <Navigate to={from} replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    setBusy(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await requestPasswordReset(email.trim());
      setNotice(res.message);
      setMode('reset-verify');
    } catch (err) {
      setError(extractApiError(err, 'Could not request a reset code.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyReset(e: FormEvent) {
    e.preventDefault();
    if (!otpValid || !isStrongPassword(newPassword) || !passwordsMatch) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyPasswordReset({
        email: email.trim(),
        otp,
        newPassword,
      });
      setOtp('');
      setNewPassword('');
      setConfirm('');
      setPassword('');
      setMode('login');
      setNotice(`${res.message} Log in with your new password.`);
    } catch (err) {
      const message = extractApiError(err, 'Reset failed.');
      if (message.startsWith('OTP has expired')) {
        // Expired codes are cleared server-side — restart from the request step.
        setOtp('');
        setMode('reset-request');
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">
            {mode === 'login' ? 'Welcome back' : 'Account recovery'}
          </p>
          <h1 id="login-title">
            {mode === 'login' ? 'Log in to Sprout' : 'Reset your Sprout password'}
          </h1>
          <p>
            {mode === 'login'
              ? 'Sign in with your Firebase email and password. The seeded demo account from the README works out of the box.'
              : 'Request a one-time code by email, then set a new password. Codes expire after 15 minutes.'}
          </p>
        </div>

        {mode === 'login' && (
          <form className="form-stack" onSubmit={handleLogin}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo@sprout.app"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
              />
            </label>
            {notice && <p className="form-notice">{notice}</p>}
            {error && <p className="form-error">{error}</p>}
            <button className="primary-cta form-submit" type="submit" disabled={busy}>
              <span aria-hidden="true">-&gt;</span>
              {busy ? 'Signing in…' : 'Log In'}
            </button>
            <p className="auth-divider">or</p>
            {/* Google asserts the address is verified, so this path needs no
                verification email at all. */}
            <button
              className="secondary-cta form-submit"
              type="button"
              onClick={handleGoogleLogin}
              disabled={busy}
            >
              Continue with Google
            </button>
          </form>
        )}

        {mode === 'reset-request' && (
          <form className="form-stack" onSubmit={handleRequestReset}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-cta form-submit" type="submit" disabled={busy}>
              <span aria-hidden="true">-&gt;</span>
              {busy ? 'Sending…' : 'Send Reset OTP'}
            </button>
          </form>
        )}

        {mode === 'reset-verify' && (
          <form className="form-stack" onSubmit={handleVerifyReset}>
            {notice && <p className="form-notice">{notice}</p>}
            <label>
              6-digit code
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
              />
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
            {newPassword.length > 0 && (
              <ul className="password-checklist" aria-label="Password requirements">
                {criteria.map((c) => (
                  <li key={c.label} className={c.met ? 'met' : 'unmet'}>
                    {c.met ? '✓' : '✗'} {c.label}
                  </li>
                ))}
              </ul>
            )}
            <label>
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
            {confirm.length > 0 && !passwordsMatch && (
              <p className="form-error">Passwords do not match.</p>
            )}
            {error && <p className="form-error">{error}</p>}
            <button
              className="primary-cta form-submit"
              type="submit"
              disabled={busy || !otpValid || !isStrongPassword(newPassword) || !passwordsMatch}
            >
              <span aria-hidden="true">-&gt;</span>
              {busy ? 'Verifying…' : 'Verify OTP + Reset'}
            </button>
            <button
              className="details-link"
              type="button"
              onClick={() => switchMode('reset-request')}
            >
              Request a new code
            </button>
          </form>
        )}

        <div className="auth-footer">
          <button
            className="details-link"
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'reset-request' : 'login')}
          >
            {mode === 'login' ? 'Reset Password' : 'Back to Login'}
          </button>
          <Link className="text-link" to="/signup">
            Need an account?
          </Link>
        </div>
      </section>
      <aside className="auth-side">
        <MiniArchive />
      </aside>
    </main>
  );
}
