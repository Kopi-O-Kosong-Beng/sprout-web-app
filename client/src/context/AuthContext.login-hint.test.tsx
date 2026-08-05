import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';

/**
 * The dead end this exists to remove.
 *
 * Firebase runs one account per email, and Google is a trusted provider: sign
 * in with Google on an address that already holds an *unverified* password
 * account and Firebase keeps the uid but unlinks the password. The password the
 * user set at signup stops working, and `auth/invalid-credential` maps to
 * "Invalid email or password" — technically true, and useless. No amount of
 * retrying or resetting will help, because there is no password to reset.
 *
 * So after a password attempt has already failed, the client asks the server
 * which provider owns the address. The lookup costs nothing on the happy path
 * and only ever discloses Google-linked accounts.
 */

const firebaseMocks = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn(() => () => {}),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
}));
const apiMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSignInMethod: vi.fn(),
  recordSessionLogin: vi.fn(),
  recordSessionLogout: vi.fn(),
}));

vi.mock('firebase/auth', () => firebaseMocks);
vi.mock('../services/sproutApi', () => apiMocks);
vi.mock('../services/firebaseClient', () => ({
  getSproutFirebaseAuth: () => ({ currentUser: null }),
  isFirebaseConfigured: () => true,
}));

function credentialError(code: string): Error & { code: string } {
  const err = new Error(code) as Error & { code: string };
  err.code = code;
  return err;
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function attemptLogin(): Promise<string> {
  const { result } = renderHook(() => useAuth(), { wrapper });
  let message = '';
  await act(async () => {
    try {
      await result.current.login('taken-over@example.com', 'Password123!');
    } catch (err) {
      message = (err as Error).message;
    }
  });
  return message;
}

describe('login error when Google has taken the account over', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.recordSessionLogin.mockResolvedValue({});
  });

  it('sends the user to Google instead of repeating "invalid password"', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockRejectedValue(
      credentialError('auth/invalid-credential')
    );
    apiMocks.getSignInMethod.mockResolvedValue({ method: 'google' });

    expect(await attemptLogin()).toMatch(/signs in with Google/i);
    expect(apiMocks.getSignInMethod).toHaveBeenCalledWith('taken-over@example.com');
  });

  it('keeps the generic message for an ordinary wrong password', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockRejectedValue(
      credentialError('auth/invalid-credential')
    );
    apiMocks.getSignInMethod.mockResolvedValue({ method: 'unknown' });

    expect(await attemptLogin()).toBe('Invalid email or password.');
  });

  /* The hint is an enhancement, not a dependency. If the lookup itself fails
   * the user must still get the ordinary error rather than a crash. */
  it('falls back to the generic message when the hint lookup fails', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockRejectedValue(
      credentialError('auth/invalid-credential')
    );
    apiMocks.getSignInMethod.mockRejectedValue(new Error('network down'));

    expect(await attemptLogin()).toBe('Invalid email or password.');
  });

  /* Only credential rejections are worth a provider lookup. A blocked popup or
   * a rate limit says nothing about which provider owns the address, and the
   * request would be wasted. */
  it('does not ask for a hint on a non-credential failure', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockRejectedValue(
      credentialError('auth/too-many-requests')
    );

    expect(await attemptLogin()).toMatch(/too many attempts/i);
    expect(apiMocks.getSignInMethod).not.toHaveBeenCalled();
  });

  it('asks for no hint at all when the password is correct', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: async () => 'token' },
    });

    expect(await attemptLogin()).toBe('');
    expect(apiMocks.getSignInMethod).not.toHaveBeenCalled();
  });
});
