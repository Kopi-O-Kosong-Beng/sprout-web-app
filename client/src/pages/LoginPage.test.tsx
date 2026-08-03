import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../context/AuthContext';
import type { AuthProfile } from '../services/sproutApi';
import LoginPage from './LoginPage';

const authState = vi.hoisted(() => ({
  status: 'signed-out' as AuthStatus,
  profile: null as AuthProfile | null,
}));
const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  verifyPasswordReset: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    status: authState.status,
    firebaseUser: null,
    profile: authState.profile,
    login: authMocks.login,
    loginWithGoogle: authMocks.loginWithGoogle,
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('../services/sproutApi', () => apiMocks);

function profileFor(isAdmin: boolean): AuthProfile {
  return {
    uid: 'user-1',
    email: isAdmin ? 'sprout@gmail.com' : 'player@example.com',
    displayName: isAdmin ? 'Sprout Admin' : 'Player',
    emailVerified: true,
    isAdmin,
  };
}

/** `from` defaults to a bounced destination because that is the case most of
 *  these tests care about; pass null to exercise a plain visit to /login. */
function renderLogin(
  status: AuthStatus,
  { from = '/archive', profile = null }: {
    from?: string | null;
    profile?: AuthProfile | null;
  } = {}
) {
  authState.status = status;
  authState.profile = profile;
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/login', state: from ? { from } : null },
      ]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<p>Verify your email to continue</p>} />
        <Route path="/archive" element={<p>Private archive</p>} />
        <Route path="/admin" element={<p>Sprout accounts dashboard</p>} />
        <Route path="/home" element={<p>In-game hub</p>} />
        <Route path="/" element={<p>Public landing page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LoginPage auth redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.loginWithGoogle.mockResolvedValue(undefined);
    apiMocks.requestPasswordReset.mockResolvedValue({
      message: 'If an account exists, a reset code has been sent.',
    });
  });

  it('sends an unverified account to email verification', () => {
    renderLogin('unverified');

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  it('sends only an authenticated account to the original destination', () => {
    renderLogin('authenticated');

    expect(screen.getByText(/private archive/i)).toBeInTheDocument();
  });

  it('routes an admin to the account dashboard', () => {
    renderLogin('authenticated', { from: null, profile: profileFor(true) });

    expect(screen.getByText(/sprout accounts dashboard/i)).toBeInTheDocument();
  });

  it('routes a player into the game, not back to the landing page', () => {
    renderLogin('authenticated', { from: null, profile: profileFor(false) });

    expect(screen.getByText(/in-game hub/i)).toBeInTheDocument();
    expect(screen.queryByText(/public landing page/i)).not.toBeInTheDocument();
  });

  // A bounce means the user asked for a specific page and was stopped; sending
  // an admin to the dashboard instead would lose that destination.
  it('lets a bounced destination win over the admin dashboard', () => {
    renderLogin('authenticated', { from: '/archive', profile: profileFor(true) });

    expect(screen.getByText(/private archive/i)).toBeInTheDocument();
    expect(screen.queryByText(/sprout accounts dashboard/i)).not.toBeInTheDocument();
  });

  // /api/auth/me can fail transiently, leaving status authenticated with no
  // profile. That must land somewhere usable rather than blank.
  it('falls back to the game hub when the profile has not loaded', () => {
    renderLogin('authenticated', { from: null, profile: null });

    expect(screen.getByText(/in-game hub/i)).toBeInTheDocument();
  });

  it('shows mode-neutral copy after requesting a reset code', async () => {
    const user = userEvent.setup();
    renderLogin('signed-out');

    await user.click(screen.getByRole('button', { name: /reset password/i }));
    await user.click(screen.getByRole('button', { name: /send reset otp/i }));

    expect(
      await screen.findByText('If an account exists, a reset code has been sent.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/EMAIL_MODE|backend (?:terminal|log)/i)
    ).not.toBeInTheDocument();
  });
});

describe('LoginPage Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.loginWithGoogle.mockResolvedValue(undefined);
  });

  it('starts the Google flow without submitting the password form', async () => {
    const user = userEvent.setup();
    renderLogin('signed-out');

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(authMocks.loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(authMocks.login).not.toHaveBeenCalled();
  });

  it('surfaces a cancelled popup as a readable message, not a crash', async () => {
    const user = userEvent.setup();
    authMocks.loginWithGoogle.mockRejectedValue(
      new Error('Google sign-in was cancelled.')
    );
    renderLogin('signed-out');

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(
      await screen.findByText('Google sign-in was cancelled.')
    ).toBeInTheDocument();
  });

  it('re-enables the button after a failed attempt so the user can retry', async () => {
    const user = userEvent.setup();
    authMocks.loginWithGoogle.mockRejectedValue(new Error('Google sign-in failed.'));
    renderLogin('signed-out');

    const googleButton = screen.getByRole('button', { name: /continue with google/i });
    await user.click(googleButton);

    expect(await screen.findByText('Google sign-in failed.')).toBeInTheDocument();
    expect(googleButton).toBeEnabled();
  });

});

/**
 * Firebase fires onAuthStateChanged the instant signInWithPopup resolves, which
 * is before loginWithGoogle has finished recording the session. LoginPage's
 * redirect runs on every render, so without a guard the page navigated away
 * mid-sequence — unmounting itself while its own request was still in flight
 * and taking any resulting error message with it.
 */
describe('LoginPage holds the redirect until Google sign-in settles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays on the form while the Google request is still running', async () => {
    const user = userEvent.setup();
    let finishSignIn: (() => void) | undefined;
    authMocks.loginWithGoogle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSignIn = resolve;
        })
    );

    // One mounted page throughout: `busy` lives in its state, so a second
    // render() would be a fresh component and would prove nothing.
    authState.status = 'signed-out';
    authState.profile = null;
    // Built fresh per render: passing the same element reference back to
    // rerender lets React bail out of reconciliation, so the component would
    // never re-read the mocked auth status and the test would pass either way.
    const tree = () => (
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={<p>In-game hub</p>} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(tree());

    await user.click(screen.getByRole('button', { name: /google/i }));

    // Firebase has authenticated; loginWithGoogle has not returned yet.
    authState.status = 'authenticated';
    rerender(tree());

    expect(screen.queryByText('In-game hub')).not.toBeInTheDocument();

    finishSignIn?.();
    expect(await screen.findByText('In-game hub')).toBeInTheDocument();
  });

  it('redirects once the sign-in call has returned', async () => {
    authMocks.loginWithGoogle.mockResolvedValue(undefined);

    renderLogin('authenticated', { from: null });

    expect(await screen.findByText('In-game hub')).toBeInTheDocument();
  });
});
