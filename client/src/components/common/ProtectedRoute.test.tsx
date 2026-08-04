import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../../context/AuthContext';
import type { AuthProfile } from '../../services/sproutApi';
import ProtectedRoute from './ProtectedRoute';

const authState = vi.hoisted(() => ({
  status: 'loading' as AuthStatus,
  profile: null as AuthProfile | null,
}));

const refreshProfile = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    status: authState.status,
    firebaseUser: null,
    profile: authState.profile,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshProfile,
  }),
}));

function profileFor(isSuperAdmin: boolean): AuthProfile {
  return {
    uid: 'user-1',
    email: isSuperAdmin ? 'sprout@gmail.com' : 'player@example.com',
    displayName: isSuperAdmin ? 'Sprout Admin' : 'Player',
    emailVerified: true,
    isAdmin: isSuperAdmin,
    isSuperAdmin,
  };
}

function renderProtected(
  path: string,
  status: AuthStatus,
  profile: AuthProfile | null = null
) {
  authState.status = status;
  authState.profile = profile;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/archive"
          element={
            <ProtectedRoute>
              <p>Private archive</p>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireSuperAdmin>
              <p>Accounts dashboard</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>Log in to continue</p>} />
        <Route path="/verify-email" element={<p>Verify your email to continue</p>} />
        <Route path="/home" element={<p>In-game hub</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects unverified gameplay access to verification', () => {
    renderProtected('/archive', 'unverified');

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    expect(screen.queryByText(/private archive/i)).not.toBeInTheDocument();
  });

  it('redirects signed-out access to login', () => {
    renderProtected('/archive', 'signed-out');

    expect(screen.getByText(/log in to continue/i)).toBeInTheDocument();
  });

  it('renders protected content for a verified account', () => {
    renderProtected('/archive', 'authenticated');

    expect(screen.getByText(/private archive/i)).toBeInTheDocument();
  });

  it('renders nothing while auth is loading', () => {
    const { container } = renderProtected('/archive', 'loading');

    expect(container).toBeEmptyDOMElement();
  });

  describe('requireSuperAdmin', () => {
    it('admits a super admin', () => {
      renderProtected('/admin', 'authenticated', profileFor(true));

      expect(screen.getByText(/accounts dashboard/i)).toBeInTheDocument();
    });

    it('bounces a signed-in player to the hub', () => {
      renderProtected('/admin', 'authenticated', profileFor(false));

      expect(screen.getByText(/in-game hub/i)).toBeInTheDocument();
      expect(screen.queryByText(/accounts dashboard/i)).not.toBeInTheDocument();
    });

    it('still sends a signed-out visitor to login', () => {
      renderProtected('/admin', 'signed-out');

      expect(screen.getByText(/log in to continue/i)).toBeInTheDocument();
    });

    // A transient /api/auth/me failure leaves status 'authenticated' with a
    // null profile and nothing else refetches it. Bouncing a real operator on
    // that blip would be wrong; so would a silent blank page. The guard shows
    // a pending line and retries the profile once.
    it('shows a pending state and retries the profile while it is missing', () => {
      refreshProfile.mockClear();
      renderProtected('/admin', 'authenticated', null);

      expect(screen.getByRole('status')).toHaveTextContent(/checking operator access/i);
      expect(refreshProfile).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/accounts dashboard/i)).not.toBeInTheDocument();
    });
  });
});
