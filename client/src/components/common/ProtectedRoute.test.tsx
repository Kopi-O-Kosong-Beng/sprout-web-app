import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';

const authState = vi.hoisted(() => ({ status: 'loading' as AuthStatus }));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    status: authState.status,
    firebaseUser: null,
    profile: null,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

function renderProtected(path: string, status: AuthStatus) {
  authState.status = status;
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
        <Route path="/login" element={<p>Log in to continue</p>} />
        <Route path="/verify-email" element={<p>Verify your email to continue</p>} />
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
});
