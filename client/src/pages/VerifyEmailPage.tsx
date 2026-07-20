import { useEffect, useRef, useState } from 'react';
import { applyActionCode } from 'firebase/auth';
import { Link, useSearchParams } from 'react-router-dom';
import { MiniArchive } from '../components/common/PlantVisuals';
import { useAuth } from '../hooks/useAuth';
import { getSproutFirebaseAuth } from '../services/firebaseClient';
import { resendVerification } from '../services/sproutApi';

type ViewState = 'idle' | 'applying' | 'verified' | 'invalid' | 'sending' | 'sent';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { status, refreshProfile } = useAuth();
  const [view, setView] = useState<ViewState>('idle');
  const [message, setMessage] = useState('Verify your email to continue.');
  const handledCode = useRef<string | null>(null);
  const mode = params.get('mode');
  const code = params.get('oobCode');

  useEffect(() => {
    if (mode !== 'verifyEmail' || !code || handledCode.current === code) return;
    handledCode.current = code;
    const actionCode = code;
    setView('applying');

    async function verifyEmail() {
      try {
        await applyActionCode(getSproutFirebaseAuth(), actionCode);
        await refreshProfile();
        setView('verified');
        setMessage('Email verified. You can continue to Sprout.');
      } catch {
        setView('invalid');
        setMessage(
          'This verification link is invalid or expired. Request a new link.'
        );
      }
    }

    void verifyEmail();
  }, [code, mode, refreshProfile]);

  async function handleResend() {
    setView('sending');
    try {
      const result = await resendVerification();
      setView(result.verificationEmailSent ? 'sent' : 'idle');
      setMessage(result.message);
    } catch {
      setView('idle');
      setMessage('The verification email could not be sent. Try again shortly.');
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
            disabled={view === 'sending'}
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
