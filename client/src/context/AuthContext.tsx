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
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import axios from 'axios';
import {
  getCurrentUser,
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
  logout(): Promise<void>;
  refreshProfile(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Anti-enumeration: collapse every credential-shaped Firebase error into one
 *  generic message so the UI never reveals which field was wrong.
 *  Exported so the /test page can present the same public-facing wording.
 */
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
    () => ({ status, firebaseUser, profile, login, logout, refreshProfile }),
    [status, firebaseUser, profile, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
