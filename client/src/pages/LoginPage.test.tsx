import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../context/AuthContext';
import LoginPage from './LoginPage';

const authState = vi.hoisted(() => ({ status: 'signed-out' as AuthStatus }));
const apiMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  verifyPasswordReset: vi.fn(),
}));

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

vi.mock('../services/sproutApi', () => apiMocks);

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
  beforeEach(() => {
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
