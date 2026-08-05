import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { signupUser, type SignupResponse } from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';
import { getPasswordCriteria, isStrongPassword } from '../utils/validation';

export default function SignupPage() {
  const { loginWithGoogle } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [signupResult, setSignupResult] = useState<SignupResponse | null>(null);

  const criteria = getPasswordCriteria(password);
  const passwordsMatch = password === confirm;

  async function handleGoogleSignup() {
    setError(null);
    setDuplicateEmail(false);
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateEmail(false);

    if (displayName.trim().length === 0) {
      setError('Display name is required.');
      return;
    }
    if (email.trim().length === 0) {
      setError('Email address is required.');
      return;
    }
    if (password.length === 0) {
      setError('Password is required.');
      return;
    }
    if (!isStrongPassword(password)) {
      setError('Password does not meet all of the requirements below.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await signupUser({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      setSignupResult(res);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const message = err.response.data;
        setDuplicateEmail(
          typeof message === 'object' &&
            message !== null &&
            'error' in message &&
            message.error === 'An account with this email already exists.'
        );
      }
      setError(extractApiError(err, 'Signup failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (signupResult) {
    return (
      <main className="auth-page">
        <section className="auth-panel" aria-labelledby="signup-success-title">
          <div>
            <p className="eyebrow">Account created</p>
            <h1 id="signup-success-title">Your account is created</h1>
            {/* Only the success line is surfaced. When delivery fails the
                server's explanation ("...the verification email could not be
                sent") used to be printed here, which handed the user an error
                on what is otherwise a success screen — and an unactionable one,
                since logging in is the next step either way. The verify-email
                page they land on can resend. */}
            {signupResult.verificationEmailSent && <p>{signupResult.message}</p>}
          </div>
          <div className="auth-footer">
            <Link className="details-link" to="/login">
              Go to Login
            </Link>
          </div>
        </section>
        <aside className="auth-side">
          <div className="promise-card">
            <p className="eyebrow">Next step</p>
            <h2>Proceed to Login to verify your account</h2>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="signup-title">
        <div>
          <p className="eyebrow">Start a field journal</p>
          <h1 id="signup-title">Create your Sprout account</h1>
          <p>
            Sign up with email and password, verify your inbox, then use your
            avatar collection across the web and mobile platform.
          </p>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Fern Keeper"
              maxLength={50}
              required
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 strong characters"
              required
            />
          </label>
          {password.length > 0 && (
            <ul className="password-checklist" aria-label="Password requirements">
              {criteria.map((c) => (
                <li key={c.label} className={c.met ? 'met' : 'unmet'}>
                  {c.met ? '✓' : '✗'} {c.label}
                </li>
              ))}
            </ul>
          )}
          <label>
            Confirm password
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

          {error && (
            <p className="form-error">
              {error}{' '}
              {duplicateEmail && (
                <Link className="details-link" to="/login">
                  Log in instead
                </Link>
              )}
            </p>
          )}

          <button className="primary-cta form-submit" type="submit" disabled={submitting}>
            <span aria-hidden="true">-&gt;</span>
            {submitting ? 'Creating…' : 'Create Account'}
          </button>
          <p className="auth-divider">or</p>
          {/* Google accounts arrive already verified, so this route skips the
              verification email entirely. */}
          <button
            className="secondary-cta form-submit"
            type="button"
            onClick={handleGoogleSignup}
            disabled={submitting}
          >
            Continue with Google
          </button>
        </form>

        <div className="auth-footer">
          <Link className="text-link" to="/login">
            Already have an account?
          </Link>
        </div>
      </section>
      <aside className="auth-side">
        <div className="promise-card">
          <p className="eyebrow">What unlocks</p>
          <h2>Archive, upload, battle, and contact support with one account.</h2>
          <ul>
            <li>Firebase-backed account profile</li>
            <li>Seeded demo avatar collection</li>
            <li>Future GenAI Plantemon pipeline</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
