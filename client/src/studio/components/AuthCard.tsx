import React, { useState } from 'react';
import { AlertCircle, Database, ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';
import { Panel, Spinner } from './ui';
import markBlack from '../assets/brand/mark-black.png';
import wordmarkLight from '../assets/brand/wordmark-light.png';

const FEATURES = [
  {
    icon: Database,
    tone: 'text-brand',
    title: 'Firestore',
    // Was "Documents sync in real time through onSnapshot observers", which
    // described the browser-side subscription that firestore.rules has always
    // denied. The reads it advertised are gone; the database is reached through
    // the backend, and that is the claim worth making.
    body: 'Every read and write goes through the backend, never the browser.',
  },
  {
    icon: Lock,
    tone: 'text-info',
    title: 'Google OAuth',
    body: 'Identity verified against Google-issued auth tokens.',
  },
  {
    icon: ShieldCheck,
    tone: 'text-gold',
    title: 'Rule isolation',
    body: 'Deployed rules scope every read and write to your own records.',
  },
];

export const AuthCard: React.FC = () => {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign in error:', err);
      if (err.code === 'auth/popup-blocked') {
        setAuthError(
          'The sign-in popup was blocked by browser iframe settings. Try opening the app in its own tab.',
        );
      } else if (err.code === 'auth/cancelled-popup-request') {
        setAuthError('The sign-in request was cancelled. Click sign in to try again.');
      } else {
        setAuthError(err.message || 'Failed to sign in with Google. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Panel className="overflow-hidden">
        <div className="border-b border-line-soft p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pane bg-brand p-2.5 shadow-pixel-brand">
            <img src={markBlack} alt="" className="h-full w-full object-contain" />
          </div>

          <img src={wordmarkLight} alt="Sprout" className="mx-auto mb-5 h-8 w-auto" />

          <h2 className="text-title font-semibold text-txt">Sign in to continue</h2>
          <p className="mx-auto mt-2 max-w-sm text-body text-txt-3">
            Your document workspace is scoped to your Google account by Firestore security rules.
          </p>

          {authError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/10 p-3 text-left">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <strong className="block text-meta font-semibold text-danger">
                  Authentication notice
                </strong>
                <span className="text-meta text-txt-2">{authError}</span>
                {authError.includes('popup') && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-meta font-medium text-brand hover:underline"
                  >
                    Open in a new window
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-card bg-brand px-7 py-3 text-body font-semibold text-base transition-colors hover:bg-brand-hi disabled:pointer-events-none disabled:opacity-50"
          >
            {signingIn ? (
              <>
                <Spinner className="h-4 w-4 border-base/30 border-t-base" />
                Connecting…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {FEATURES.map(({ icon: Icon, tone, title, body }) => (
            <div key={title} className="p-4 text-center">
              <Icon className={`mx-auto mb-2 h-5 w-5 ${tone}`} />
              <h3 className="text-meta font-semibold text-txt">{title}</h3>
              <p className="mt-1 text-label text-txt-4">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};
