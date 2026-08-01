import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../context/AuthContext';
import { NavigationLockProvider } from '../../context/NavigationLockProvider';
import type { AuthProfile } from '../../services/sproutApi';
import AppHeader from './AppHeader';

/** The Admin entry is the only nav item that is hidden rather than disabled for
 *  someone who cannot use it. A disabled item reads "Log in to access", which
 *  would be false for a signed-in player: nothing they can do gets them past
 *  the server's ADMIN_EMAILS allowlist. */

function authValue(profile: AuthProfile | null): AuthContextValue {
  return {
    status: profile ? 'authenticated' : 'signed-out',
    firebaseUser: null,
    profile,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  };
}

function profileFor(isAdmin: boolean): AuthProfile {
  return {
    uid: 'user-1',
    email: isAdmin ? 'sprout@gmail.com' : 'player@example.com',
    displayName: isAdmin ? 'Sprout Admin' : 'Player',
    emailVerified: true,
    isAdmin,
  };
}

function renderHeader(profile: AuthProfile | null) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue(profile)}>
        <NavigationLockProvider>
          <AppHeader />
        </NavigationLockProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('AppHeader admin link', () => {
  it('offers the dashboard to an admin', () => {
    renderHeader(profileFor(true));

    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin'
    );
  });

  it('hides it from a signed-in player entirely', () => {
    renderHeader(profileFor(false));

    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).queryByText('Admin')).not.toBeInTheDocument();
    // The player's own nav is untouched.
    expect(within(nav).getByRole('link', { name: 'Play' })).toBeInTheDocument();
  });

  it('hides it from a signed-out visitor', () => {
    renderHeader(null);

    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).queryByText('Admin')).not.toBeInTheDocument();
  });
});
