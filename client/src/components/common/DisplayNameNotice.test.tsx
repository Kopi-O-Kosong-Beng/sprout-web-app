import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayNameNotice from './DisplayNameNotice';
import { ToastProvider } from './Toast';

const apiMocks = vi.hoisted(() => ({ acknowledgeDisplayNameNotice: vi.fn() }));
const authMocks = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  refreshProfile: vi.fn(),
}));

vi.mock('../../services/sproutApi', () => apiMocks);
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ profile: authMocks.profile, refreshProfile: authMocks.refreshProfile }),
}));

function renderNotice() {
  return {
    user: userEvent.setup(),
    ...render(
      <ToastProvider>
        <DisplayNameNotice />
      </ToastProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.acknowledgeDisplayNameNotice.mockResolvedValue(undefined);
  authMocks.profile = null;
});

describe('the renamed-account notice', () => {
  it('says nothing to a player whose name was not taken', () => {
    authMocks.profile = { uid: 'u1', displayName: 'nat' };
    renderNotice();

    expect(screen.queryByText(/was taken/i)).not.toBeInTheDocument();
  });

  it('names both the wanted name and the one they got', () => {
    authMocks.profile = { uid: 'u1', displayName: 'nat2', displayNameAdjustedFrom: 'nat' };
    renderNotice();

    expect(screen.getByText(/"nat" was taken, so you're "nat2" for now\./)).toBeVisible();
  });

  it('acknowledges on "okie!" so it does not return', async () => {
    authMocks.profile = { uid: 'u1', displayName: 'nat2', displayNameAdjustedFrom: 'nat' };
    const { user } = renderNotice();

    await user.click(screen.getByRole('button', { name: /okie!/i }));

    expect(apiMocks.acknowledgeDisplayNameNotice).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/was taken/i)).not.toBeInTheDocument();
  });

  it('shows once, not once per render', () => {
    authMocks.profile = { uid: 'u1', displayName: 'nat2', displayNameAdjustedFrom: 'nat' };
    const { rerender } = renderNotice();

    rerender(
      <ToastProvider>
        <DisplayNameNotice />
      </ToastProvider>
    );

    expect(screen.getAllByText(/was taken/i)).toHaveLength(1);
  });

  it('does not leave the player stuck when acknowledging fails', async () => {
    apiMocks.acknowledgeDisplayNameNotice.mockRejectedValue(new Error('offline'));
    authMocks.profile = { uid: 'u1', displayName: 'nat2', displayNameAdjustedFrom: 'nat' };
    const { user } = renderNotice();

    await user.click(screen.getByRole('button', { name: /okie!/i }));

    // Dismissed either way; being told again next sign-in beats a stuck toast.
    expect(screen.queryByText(/was taken/i)).not.toBeInTheDocument();
  });
});
