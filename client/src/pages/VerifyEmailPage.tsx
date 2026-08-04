import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { applyActionCode } from 'firebase/auth';
import { Link, useSearchParams } from 'react-router-dom';
import { MiniArchive } from '../components/common/PlantVisuals';
import { useAuth } from '../hooks/useAuth';
import { extractApiError } from '../services/apiClient';
import { getSproutFirebaseAuth } from '../services/firebaseClient';
import { resendVerification } from '../services/sproutApi';

type ViewState = 'idle' | 'applying' | 'verified' | 'invalid' | 'sending' | 'sent';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { status, refreshProfile } = useAuth();
  const [view, setView] = useState<ViewState>('idle');
  const [message, setMessage] = useState('Verify your email to continue.');
  const handledCode = useRef<string | null>(null);
  const applyingCode = useRef(false);
  const mode = params.get('mode');
  const code = params.get('oobCode');

  useEffect(() => {
    if (mode !== 'verifyEmail' || !code || handledCode.current === code) return;
    handledCode.current = code;
    const actionCode = code;
    applyingCode.current = true;
    setView('applying');
    setMessage('Verifying your email...');

    async function verifyEmail() {
      try {
        await applyActionCode(getSproutFirebaseAuth(), actionCode);
      } catch {
        applyingCode.current = false;
        setView('invalid');
        setMessage(
          'This verification link is invalid or expired. Request a new link.'
        );
        return;
      }

      applyingCode.current = false;
      setView('verified');
      setMessage('Email verified. You can continue to Sprout.');

      try {
        await refreshProfile();
      } catch {
        setMessage('Email verified. Sign in again to refresh your Sprout session.');
      }
    }

    void verifyEmail();
  }, [code, mode, refreshProfile]);

  async function handleResend() {
    if (applyingCode.current || view === 'applying' || view === 'sending') return;
    setView('sending');
    try {
      const result = await resendVerification();
      setView(result.verificationEmailSent ? 'sent' : 'idle');
      setMessage(result.message);
    } catch (err) {
      setView('idle');
      // The backend names the real reason when it can (rate limit, auth) —
      // a swallowed generic string here hid a broken mail transport for days.
      // Non-API failures keep the calm generic line.
      const fallback =
        'The verification email could not be sent. Try again shortly.';
      setMessage(axios.isAxiosError(err) ? extractApiError(err, fallback) : fallback);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-live="polite">
        <div>
          <p className="eyebrow">Account security</p>
          <h1>{view === 'verified' ? 'Email verified' : 'Verify your email'}</h1>
          <p>{message}</p>
        </div>

        {status === 'unverified' && view !== 'verified' && (
          <button
            className="primary-cta form-submit"
            type="button"
            onClick={handleResend}
            disabled={view === 'applying' || view === 'sending'}
          >
            <span aria-hidden="true">-&gt;</span>
            {view === 'sending' ? 'Sending...' : 'Resend verification email'}
          </button>
        )}

        <div className="auth-footer">
          <Link
            className="details-link"
            to={status === 'authenticated' ? '/archive' : '/login'}
          >
            {status === 'authenticated' ? 'Open archive' : 'Go to login'}
          </Link>
        </div>
      </section>
      <aside className="auth-side">
        <MiniArchive />
      </aside>
    </main>
  );
}
