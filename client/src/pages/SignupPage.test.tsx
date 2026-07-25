import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignupPage from './SignupPage';

const signupUser = vi.hoisted(() => vi.fn());
const loginWithGoogle = vi.hoisted(() => vi.fn());

vi.mock('../services/sproutApi', () => ({ signupUser }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-out',
    firebaseUser: null,
    profile: null,
    login: vi.fn(),
    loginWithGoogle,
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

function renderSignup() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>
  );
}

describe('SignupPage verification handoff', () => {
  beforeEach(() => {
    signupUser.mockResolvedValue({
      uid: 'test-user',
      email: 'fern@example.com',
      displayName: 'Fern Keeper',
      emailVerified: false,
      verificationEmailSent: true,
      message: 'Check your email for the verification link.',
    });
  });

  it('limits display names to the server maximum', () => {
    renderSignup();

    expect(screen.getByLabelText(/display name/i)).toHaveAttribute('maxlength', '50');
  });

  it('shows inbox guidance without local EMAIL_MODE instructions', async () => {
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/display name/i), 'Fern Keeper');
    await user.clear(screen.getByLabelText(/email address/i));
    await user.type(screen.getByLabelText(/email address/i), 'fern@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass1!');
    await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass1!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Check your email for the verification link.')).toBeInTheDocument();
    expect(screen.queryByText(/EMAIL_MODE=console/i)).not.toBeInTheDocument();
  });

  it('offers Google sign-up, which needs no verification email or password', async () => {
    const user = userEvent.setup();
    loginWithGoogle.mockResolvedValue(undefined);
    renderSignup();

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(signupUser).not.toHaveBeenCalled();
  });
});
