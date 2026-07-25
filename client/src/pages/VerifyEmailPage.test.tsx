import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthStatus } from '../context/AuthContext';
import VerifyEmailPage from './VerifyEmailPage';

const mocks = vi.hoisted(() => ({
  applyActionCode: vi.fn(),
  getSproutFirebaseAuth: vi.fn(() => ({ name: 'test-auth' })),
  refreshProfile: vi.fn(),
  resendVerification: vi.fn(),
  status: 'unverified' as AuthStatus,
}));

vi.mock('firebase/auth', () => ({
  applyActionCode: mocks.applyActionCode,
}));

vi.mock('../services/firebaseClient', () => ({
  getSproutFirebaseAuth: mocks.getSproutFirebaseAuth,
}));

vi.mock('../services/sproutApi', () => ({
  resendVerification: mocks.resendVerification,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    status: mocks.status,
    firebaseUser: null,
    profile: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshProfile: mocks.refreshProfile,
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    mocks.status = 'unverified';
    mocks.applyActionCode.mockResolvedValue(undefined);
    mocks.refreshProfile.mockResolvedValue(undefined);
    mocks.resendVerification.mockResolvedValue({
      verificationEmailSent: true,
      message: 'Verification email sent.',
    });
  });

  it('applies a verifyEmail action code and shows success', async () => {
    renderAt('/verify-email?mode=verifyEmail&oobCode=test-code');

    expect(await screen.findByRole('heading', { name: /email verified/i })).toBeInTheDocument();
    expect(mocks.applyActionCode).toHaveBeenCalledWith(
      mocks.getSproutFirebaseAuth(),
      'test-code'
    );
    expect(mocks.refreshProfile).toHaveBeenCalledOnce();
  });

  it('shows recovery copy when the action code is invalid', async () => {
    mocks.applyActionCode.mockRejectedValue(new Error('expired'));

    renderAt('/verify-email?mode=verifyEmail&oobCode=expired-code');

    expect(await screen.findByText(/invalid or expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeEnabled();
  });

  it('keeps verified success when refreshing the session fails', async () => {
    mocks.refreshProfile.mockRejectedValue(new Error('refresh failed'));

    renderAt('/verify-email?mode=verifyEmail&oobCode=valid-code');

    expect(
      await screen.findByRole('heading', { name: /email verified/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/sign in again to refresh/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid or expired/i)).not.toBeInTheDocument();
  });

  it('blocks resend while an action code is being applied', async () => {
    let resolveApply: (() => void) | undefined;
    mocks.applyActionCode.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveApply = resolve;
      })
    );
    const user = userEvent.setup();

    renderAt('/verify-email?mode=verifyEmail&oobCode=pending-code');

    expect(await screen.findByText('Verifying your email...')).toBeInTheDocument();
    const resend = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    expect(resend).toBeDisabled();
    await user.click(resend);
    expect(mocks.resendVerification).not.toHaveBeenCalled();

    await act(async () => resolveApply?.());
    expect(
      await screen.findByRole('heading', { name: /email verified/i })
    ).toBeInTheDocument();
  });

  it('offers resend for an authenticated unverified user', async () => {
    const user = userEvent.setup();
    renderAt('/verify-email');

    await user.click(screen.getByRole('button', { name: /resend verification email/i }));

    expect(mocks.resendVerification).toHaveBeenCalledOnce();
    expect(await screen.findByText('Verification email sent.')).toBeInTheDocument();
  });

  it('recovers when resending fails', async () => {
    const user = userEvent.setup();
    mocks.resendVerification.mockRejectedValue(new Error('offline'));
    renderAt('/verify-email');

    await user.click(screen.getByRole('button', { name: /resend verification email/i }));

    expect(await screen.findByText(/could not be sent/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeEnabled();
  });

  it('does not offer resend to a signed-out visitor', () => {
    mocks.status = 'signed-out';

    renderAt('/verify-email');

    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/login');
  });
});
