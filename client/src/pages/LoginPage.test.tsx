import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../context/AuthContext';
import LoginPage from './LoginPage';

const authState = vi.hoisted(() => ({ status: 'signed-out' as AuthStatus }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    status: authState.status,
    firebaseUser: null,
    profile: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

function renderLogin(status: AuthStatus) {
  authState.status = status;
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/archive' } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<p>Verify your email to continue</p>} />
        <Route path="/archive" element={<p>Private archive</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LoginPage auth redirects', () => {
  it('sends an unverified account to email verification', () => {
    renderLogin('unverified');

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  it('sends only an authenticated account to the original destination', () => {
    renderLogin('authenticated');

    expect(screen.getByText(/private archive/i)).toBeInTheDocument();
  });
});
