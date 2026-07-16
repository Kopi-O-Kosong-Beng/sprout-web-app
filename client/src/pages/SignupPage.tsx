import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { signupUser } from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';
import { getPasswordCriteria, isStrongPassword } from '../utils/validation';

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const criteria = getPasswordCriteria(password);
  const passwordsMatch = password === confirm;

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
      setSuccessMessage(res.message);
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

  if (successMessage) {
    return (
      <main className="auth-page">
        <section className="auth-panel" aria-labelledby="signup-success-title">
          <div>
            <p className="eyebrow">Account created</p>
            <h1 id="signup-success-title">Check your inbox to verify</h1>
            <p>{successMessage}</p>
            <p>
              Open the verification link, then log in. With{' '}
              <code>EMAIL_MODE=console</code> the link is printed in the backend
              terminal instead of a real inbox.
            </p>
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
            <h2>Verify your email, then sign in to sync your archive.</h2>
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
              maxLength={80}
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
            <li>Future GenAI plant sprite pipeline</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
