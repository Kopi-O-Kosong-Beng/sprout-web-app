import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';

/**
 * AuthContext.logout(), which nothing was driving.
 *
 * AppHeader.logout.test.tsx covers the BUTTON — but it injects `logout: vi.fn()`,
 * so it proves the control calls something and says nothing about what that
 * something does. auth.test.ts covers the ENDPOINT that records the audit
 * timestamp. Between the two sat the function the button actually calls, with a
 * branch and a deliberately swallowed error, untested.
 *
 * The case that matters most is the third one below. Recording the logout audit
 * is best-effort by design, so a failure there must NOT stop the sign-out. If
 * someone later removes that `.catch`, a backend hiccup would leave a user who
 * pressed "Log out" still signed in while believing otherwise — on a shared
 * machine that is the whole point of the button failing quietly.
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
/*
  Stateful on purpose. The real endDevSession() clears the stored session, so a
  subsequent getDevSession() returns null — and the provider's mount effect
  calls getDevSession() to decide whether to derive dev state at all. A mock
  that kept handing back a session after it had been ended would model a
  situation that cannot occur, and the test would fail on its own fiction.
*/
const devSessionMocks = vi.hoisted(() => {
  const state: { session: { email: string; uid: string } | null } = { session: null };
  return {
    state,
    getDevSession: vi.fn(() => state.session),
    endDevSession: vi.fn(() => {
      state.session = null;
    }),
    startDevSession: vi.fn(),
    isDevAdminEmail: vi.fn(() => false),
    isDevLoginEnabled: vi.fn(() => false),
    DEV_ADMIN_EMAIL: 'test@sprout.com',
  };
});
const firebaseClientMocks = vi.hoisted(() => ({
  isFirebaseConfigured: vi.fn(() => true),
  getSproutFirebaseAuth: vi.fn(() => ({
    currentUser: { getIdToken: vi.fn(async () => 'id-token') },
  })),
}));

vi.mock('firebase/auth', () => firebaseMocks);
vi.mock('../services/sproutApi', () => apiMocks);
/* `state` is a test-only handle and must not be presented as a module export. */
vi.mock('../services/devSession', () => ({
  getDevSession: devSessionMocks.getDevSession,
  endDevSession: devSessionMocks.endDevSession,
  startDevSession: devSessionMocks.startDevSession,
  isDevAdminEmail: devSessionMocks.isDevAdminEmail,
  isDevLoginEnabled: devSessionMocks.isDevLoginEnabled,
  DEV_ADMIN_EMAIL: devSessionMocks.DEV_ADMIN_EMAIL,
}));
vi.mock('../services/firebaseClient', () => firebaseClientMocks);

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

/** Renders the provider and runs logout(), returning any error it threw. */
async function runLogout(): Promise<Error | null> {
  const { result } = renderHook(() => useAuth(), { wrapper });
  let thrown: Error | null = null;
  await act(async () => {
    try {
      await result.current.logout();
    } catch (err) {
      thrown = err as Error;
    }
  });
  return thrown;
}

describe('AuthContext.logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    devSessionMocks.state.session = null;
    firebaseClientMocks.isFirebaseConfigured.mockReturnValue(true);
    firebaseClientMocks.getSproutFirebaseAuth.mockReturnValue({
      currentUser: { getIdToken: vi.fn(async () => 'id-token') },
    });
    apiMocks.recordSessionLogout.mockResolvedValue({});
    firebaseMocks.signOut.mockResolvedValue(undefined);
  });

  it('records the audit and then signs out of Firebase', async () => {
    expect(await runLogout()).toBeNull();

    expect(apiMocks.recordSessionLogout).toHaveBeenCalledWith('id-token');
    expect(firebaseMocks.signOut).toHaveBeenCalledTimes(1);
    // A dev session was never involved, so nothing should have been torn down.
    expect(devSessionMocks.endDevSession).not.toHaveBeenCalled();
  });

  /*
    The important one. The audit write is best-effort: it exists so an operator
    can see when someone last signed out, and losing that line is a nuisance.
    Failing to actually sign the user out is a security problem. If this test
    goes red because signOut stopped being called, do not "fix" it by making
    the audit failure fatal — the user pressed a button that says Log out.
  */
  it('still signs out when recording the audit fails', async () => {
    apiMocks.recordSessionLogout.mockRejectedValue(new Error('backend down'));

    // The rejection must not surface to the caller either: the header awaits
    // this and would otherwise show an error on a logout that did work.
    expect(await runLogout()).toBeNull();
    expect(firebaseMocks.signOut).toHaveBeenCalledTimes(1);
  });

  /*
    The dev-session branch, which returns before Firebase is touched at all.
    A local dev sign-in has no Firebase user to sign out of, so calling signOut
    would operate on whatever real session happened to be present.
  */
  it('clears a dev session locally without calling Firebase', async () => {
    devSessionMocks.state.session = { email: 'test@sprout.com', uid: 'dev-uid' };

    expect(await runLogout()).toBeNull();

    expect(devSessionMocks.endDevSession).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.signOut).not.toHaveBeenCalled();
    expect(apiMocks.recordSessionLogout).not.toHaveBeenCalled();
  });

  it('leaves the dev session signed out in the hook state', async () => {
    devSessionMocks.state.session = { email: 'test@sprout.com', uid: 'dev-uid' };

    const { result } = renderHook(() => useAuth(), { wrapper });
    /* Let the mount effect finish deriving dev state before logging out.
       Without this the assertion races it: the effect resolves after logout
       and writes 'authenticated' back over 'signed-out'. Asserting the
       precondition also makes the test prove a TRANSITION rather than an end
       state that might have been true all along. */
    await act(async () => {});
    expect(result.current.status).toBe('authenticated');

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('signed-out');
    expect(result.current.profile).toBeNull();
    expect(result.current.firebaseUser).toBeNull();
  });

  /* Firebase absent (no env config) is a no-op rather than a crash, so a
     misconfigured local build does not throw on a button press. */
  it('does nothing when Firebase is not configured', async () => {
    firebaseClientMocks.isFirebaseConfigured.mockReturnValue(false);

    expect(await runLogout()).toBeNull();

    expect(firebaseMocks.signOut).not.toHaveBeenCalled();
    expect(apiMocks.recordSessionLogout).not.toHaveBeenCalled();
  });
});
