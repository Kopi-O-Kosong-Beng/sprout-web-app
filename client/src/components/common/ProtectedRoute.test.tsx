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

vi.mock('../../hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    status: authState.status,
    firebaseUser: null,
    profile: authState.profile,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
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
    // null profile; bouncing a real operator on that blip would be worse than
    // a blank beat while the profile loads.
    it('renders nothing while authenticated with no profile yet', () => {
      const { container } = renderProtected('/admin', 'authenticated', null);

      expect(container).toBeEmptyDOMElement();
    });
  });
});
