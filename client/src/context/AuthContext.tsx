/** App-wide auth state. Login is 100% client-side via the Firebase JS SDK
 *  (no backend /login endpoint exists); protected API calls get their token
 *  from the apiClient request interceptor. Replaces the old test-page pattern
 *  of copying the ID token into localStorage.
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import axios from 'axios';
import {
  getCurrentUser,
  getSignInMethod,
  recordSessionLogin,
  recordSessionLogout,
  type AuthProfile,
} from '../services/sproutApi';
import {
  getSproutFirebaseAuth,
  isFirebaseConfigured,
} from '../services/firebaseClient';

export type AuthStatus = 'loading' | 'signed-out' | 'unverified' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  firebaseUser: User | null;
  profile: AuthProfile | null;
  login(email: string, password: string): Promise<void>;
  loginWithGoogle(): Promise<void>;
  logout(): Promise<void>;
  refreshProfile(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Anti-enumeration: collapse every credential-shaped Firebase error into one
 *  generic message so the UI never reveals which field was wrong.
 *  Exported so the /test page can present the same public-facing wording.
 */
export const GOOGLE_ONLY_LOGIN_MESSAGE =
  'This email signs in with Google. Use "Continue with Google" below.';

/** True for the errors Firebase returns when the address exists but the
 *  password does not open it — including the case where Google has taken the
 *  account over and removed the password entirely. */
function isCredentialRejection(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  return (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password'
  );
}

export function mapFirebaseLoginError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Invalid email or password.';
    // Popup-specific outcomes: the user closing the window is not an error
    // worth alarming them about, so it maps to a calm, actionable message.
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already registered with a password. Log in with your password instead.';
    case 'auth/unauthorized-domain':
      return 'This site is not authorised for Google sign-in yet.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return 'Network error. Check your connection and try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isFirebaseConfigured() ? 'loading' : 'signed-out'
  );
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const deriveState = useCallback(async (user: User | null) => {
    setFirebaseUser(user);
    if (!user) {
      setProfile(null);
      setStatus('signed-out');
      return;
    }
    if (!user.emailVerified) {
      setProfile(null);
      setStatus('unverified');
      return;
    }
    try {
      setProfile(await getCurrentUser());
      setStatus('authenticated');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        // Token claim lagging behind a very recent verification — treat as unverified.
        setProfile(null);
        setStatus('unverified');
        return;
      }
      // Transient backend failure: stay usable; profile just isn't loaded yet.
      setProfile(null);
      setStatus('authenticated');
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getSproutFirebaseAuth();
    return onAuthStateChanged(auth, (user) => {
      void deriveState(user);
    });
  }, [deriveState]);

  const login = useCallback(async (email: string, password: string) => {
    if (!isFirebaseConfigured()) {
      throw new Error(
        'Firebase is not configured — fill client/.env.local with the VITE_FIREBASE_* values.'
      );
    }
    try {
      const credential = await signInWithEmailAndPassword(
        getSproutFirebaseAuth(),
        email,
        password
      );
      await recordSessionLogin(await credential.user.getIdToken());
    } catch (err) {
      // "Invalid email or password" is a dead end for an account Google has
      // taken over: the password was right when it was set, and no amount of
      // retrying or resetting will help. Only after the attempt has already
      // failed do we ask the server which provider owns the address, so the
      // hint costs nothing on the happy path and reveals nothing that a
      // successful Google sign-in would not.
      if (isCredentialRejection(err)) {
        const hint = await getSignInMethod(email).catch(() => null);
        if (hint?.method === 'google') throw new Error(GOOGLE_ONLY_LOGIN_MESSAGE);
      }
      throw new Error(mapFirebaseLoginError(err));
    }
  }, []);

  /** Google sign-in. Google asserts the email is already verified, so these
   *  users skip the verification-link step entirely — no outbound email is
   *  involved. The backend auto-provisions the Sprout profile on the first
   *  /api/auth/me call, so no extra signup request is needed here. */
  const loginWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      throw new Error(
        'Firebase is not configured — fill client/.env.local with the VITE_FIREBASE_* values.'
      );
    }
    try {
      const provider = new GoogleAuthProvider();
      // Always show the chooser: on shared/demo machines a silent re-login as
      // the previous account is confusing.
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(getSproutFirebaseAuth(), provider);
      // The session record is an audit row, not part of authentication — the
      // user is signed in either way. Awaiting it as a hard failure meant a
      // transient backend blip surfaced as "Google sign-in failed" on an
      // account that was, in fact, signed in. Tolerated the same way logout
      // tolerates its own audit write.
      await recordSessionLogin(await credential.user.getIdToken()).catch((err) => {
        if (import.meta.env.DEV) console.warn('Failed to record login audit', err);
      });
    } catch (err) {
      throw new Error(mapFirebaseLoginError(err));
    }
  }, []);

  const logout = useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    const token = await getSproutFirebaseAuth().currentUser?.getIdToken();
    await recordSessionLogout(token).catch((err) => {
      if (import.meta.env.DEV) console.warn('Failed to record logout audit', err);
    });
    await signOut(getSproutFirebaseAuth());
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    const user = getSproutFirebaseAuth().currentUser;
    if (!user) return;
    // reload() picks up a verification-link click made in another tab; force a
    // token refresh so the backend sees the updated email_verified claim.
    await user.reload();
    await user.getIdToken(true);
    await deriveState(getSproutFirebaseAuth().currentUser);
  }, [deriveState]);

  const value = useMemo(
    () => ({
      status,
      firebaseUser,
      profile,
      login,
      loginWithGoogle,
      logout,
      refreshProfile,
    }),
    [status, firebaseUser, profile, login, loginWithGoogle, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
