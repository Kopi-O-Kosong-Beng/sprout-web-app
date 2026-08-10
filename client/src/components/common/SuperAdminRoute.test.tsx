import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../../context/AuthContext';
import type { AuthProfile } from '../../services/sproutApi';
import SuperAdminRoute from './SuperAdminRoute';

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

function profileWith(flags: Pick<AuthProfile, 'isAdmin' | 'isSuperAdmin'>): AuthProfile {
  return {
    uid: 'user-1',
    email: 'someone@example.com',
    displayName: 'Someone',
    emailVerified: true,
    ...flags,
  };
}

function renderGuarded(status: AuthStatus, profile: AuthProfile | null = null) {
  authState.status = status;
  authState.profile = profile;
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <SuperAdminRoute>
              <p>Accounts dashboard</p>
            </SuperAdminRoute>
          }
        />
        <Route path="/" element={<p>Public landing page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SuperAdminRoute', () => {
  it('admits the operator tier', () => {
    renderGuarded('authenticated', profileWith({ isAdmin: true, isSuperAdmin: true }));
    expect(screen.getByText(/accounts dashboard/i)).toBeInTheDocument();
  });

  /* The tiers are distinct (see AuthProfile): the plain ADMIN_EMAILS badge is
     advisory and opens nothing server-side. The guard used to check isAdmin,
     so a badge-holder got the operator shell and a page of 403s — the door
     must agree with AppHeader's nav filter, which already checks the grant. */
  it('bounces a plain admin badge-holder home — the badge is not the grant', () => {
    renderGuarded('authenticated', profileWith({ isAdmin: true, isSuperAdmin: false }));
    expect(screen.getByText(/public landing page/i)).toBeInTheDocument();
    expect(screen.queryByText(/accounts dashboard/i)).not.toBeInTheDocument();
  });

  it('bounces a plain player home', () => {
    renderGuarded('authenticated', profileWith({ isAdmin: false, isSuperAdmin: false }));
    expect(screen.getByText(/public landing page/i)).toBeInTheDocument();
  });

  it('sends the signed-out to login', () => {
    renderGuarded('signed-out');
    expect(screen.getByText(/login page/i)).toBeInTheDocument();
  });
});
