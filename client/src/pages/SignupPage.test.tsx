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

  it('explains the display-name policy instead of a generic failure', async () => {
    // "José" and "O'Brien" are real names the ASCII-only policy turns away —
    // a deliberate policy (matching the password rules), but the reason has
    // to reach the player: the server's version of this rejection is a Joi
    // pattern dump that extractApiError collapses into "Signup failed."
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/display name/i), "José O'Brien");
    await user.type(screen.getByLabelText(/email address/i), 'jose@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass1!');
    await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass1!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/letters \(A-Z\), numbers, spaces, hyphens and underscores/i)
    ).toBeInTheDocument();
    // Caught client-side: the doomed request is never sent.
    expect(signupUser).not.toHaveBeenCalled();
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

/**
 * The success screen. It used to print the server's explanation verbatim,
 * which on a delivery failure meant an error message on what is otherwise a
 * success — and an unactionable one, since logging in is the next step either
 * way and the verify-email page can resend.
 */
describe('SignupPage success screen', () => {
  const BASE = {
    uid: 'user-1',
    email: 'ada@example.com',
    displayName: 'Ada',
    emailVerified: false,
  };

  async function signUpWith(result: Record<string, unknown>) {
    signupUser.mockResolvedValue({ ...BASE, ...result });
    const user = userEvent.setup();
    renderSignup();

    await user.type(screen.getByLabelText(/display name/i), 'Ada');
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));
  }

  it('confirms the account and points at login', async () => {
    await signUpWith({
      verificationEmailSent: true,
      message: 'Check your email for the verification link.',
    });

    expect(
      await screen.findByRole('heading', { name: 'Your account is created' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/proceed to login to verify your account/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute(
      'href',
      '/login'
    );
  });

  it('hides a delivery failure rather than reporting it as an error', async () => {
    await signUpWith({
      verificationEmailSent: false,
      message:
        'Account created, but the verification email could not be sent. Sign in and request a new link.',
    });

    expect(
      await screen.findByRole('heading', { name: 'Your account is created' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not be sent/i)).toBeNull();
    expect(
      screen.queryByText(/log in to request a new verification email/i)
    ).toBeNull();
  });
});
