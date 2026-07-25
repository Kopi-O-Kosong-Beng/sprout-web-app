import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { requestPasswordReset, verifyPasswordReset } from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { getPasswordCriteria, isStrongPassword } from '../utils/validation';
import { MiniArchive } from '../components/common/PlantVisuals';

type Mode = 'login' | 'reset-request' | 'reset-verify';

export default function LoginPage() {
  const { status, login, loginWithGoogle } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

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
  if (status === 'unverified') {
    return <Navigate to="/verify-email" state={{ from }} replace />;
  }
  if (status === 'authenticated') {
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
