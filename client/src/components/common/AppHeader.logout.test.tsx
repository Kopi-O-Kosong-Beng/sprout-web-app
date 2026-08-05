import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../context/AuthContext';
import { NavigationLockProvider } from '../../context/NavigationLockProvider';
import type { AuthProfile } from '../../services/sproutApi';
import AppHeader from './AppHeader';

/**
 * Logging out has to move the user as well as clear the session.
 *
 * Every game screen and the operator tools are gated, so a logout that left
 * them where they stood would drop them on a page ProtectedRoute is about to
 * bounce — a redirect flash instead of a clean exit. `/` is the one page that
 * reads correctly signed out.
 */

const logout = vi.fn<() => Promise<void>>();

function authValue(profile: AuthProfile | null): AuthContextValue {
  return {
    status: profile ? 'authenticated' : 'signed-out',
    firebaseUser: null,
    profile,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout,
    refreshProfile: vi.fn(),
  };
}

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderAt(pathname: string, profile: AuthProfile | null) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AuthContext.Provider value={authValue(profile)}>
        <NavigationLockProvider>
          <AppHeader />
          <LocationProbe />
          <Routes>
            <Route path="*" element={null} />
          </Routes>
        </NavigationLockProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

const PLAYER: AuthProfile = {
  uid: 'user-1',
  email: 'player@example.com',
  displayName: 'Player',
  emailVerified: true,
  isAdmin: false,
};

const OPERATOR: AuthProfile = { ...PLAYER, isAdmin: true, isSuperAdmin: true };

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logout.mockResolvedValue();
  });

  it('clears the session and returns the player to the public home', async () => {
    const user = userEvent.setup();
    renderAt('/archive', PLAYER);

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  /* Superadmins log out from pages a signed-out visitor cannot even see, so
   * the same exit has to apply. */
  it('returns an operator to the public home from a gated tool', async () => {
    const user = userEvent.setup();
    renderAt('/tickets', OPERATOR);

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('offers no log out control to a signed-out visitor', () => {
    renderAt('/', null);

    expect(screen.queryByRole('button', { name: /log out/i })).toBeNull();
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
  });
});
