import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage';

const apiMocks = vi.hoisted(() => ({
  listAdminAccounts: vi.fn(),
  deleteAdminAccount: vi.fn(),
}));

vi.mock('../services/sproutApi', () => apiMocks);

const ACCOUNTS = {
  items: [
    {
      id: 'uid-member',
      email: 'member@example.com',
      displayName: 'Member',
      isVerified: true,
      isAdmin: false,
      pveXp: 40,
      pveWins: 2,
      pveLosses: 1,
      createdAt: '2026-07-21T00:00:00.000Z',
      lastLogin: null,
    },
    {
      id: 'uid-admin',
      email: 'hello.sprout.team@gmail.com',
      displayName: 'Sprout Team',
      isVerified: true,
      isAdmin: true,
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      createdAt: '2026-07-19T00:00:00.000Z',
      lastLogin: null,
    },
  ],
  total: 2,
};

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

function rowFor(email: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(email, 'i') });
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listAdminAccounts.mockResolvedValue(ACCOUNTS);
    apiMocks.deleteAdminAccount.mockResolvedValue({
      id: 'uid-member',
      firebaseIdentityDeleted: true,
      profileDeleted: true,
    });
  });

  it('lists every account and marks the admin', async () => {
    renderAdmin();

    expect(await screen.findByText('member@example.com')).toBeInTheDocument();
    expect(
      within(rowFor('hello.sprout.team@gmail.com')).getByText('admin')
    ).toBeInTheDocument();
    expect(
      within(rowFor('member@example.com')).queryByText('admin')
    ).not.toBeInTheDocument();
  });

  it('requires a confirmation step before deleting', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('member@example.com');

    await user.click(within(rowFor('member@example.com')).getByRole('button', { name: /^delete$/i }));

    // First click only arms the action; nothing is deleted yet.
    expect(apiMocks.deleteAdminAccount).not.toHaveBeenCalled();
    expect(
      within(rowFor('member@example.com')).getByRole('button', { name: /confirm delete/i })
    ).toBeInTheDocument();
  });

  it('deletes on confirm and removes the row without a reload', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('member@example.com');

    await user.click(within(rowFor('member@example.com')).getByRole('button', { name: /^delete$/i }));
    await user.click(
      within(rowFor('member@example.com')).getByRole('button', { name: /confirm delete/i })
    );

    expect(apiMocks.deleteAdminAccount).toHaveBeenCalledWith('uid-member');
    expect(screen.queryByText('member@example.com')).not.toBeInTheDocument();
    expect(
      await screen.findByText(/that address can now register again/i)
    ).toBeInTheDocument();
  });

  it('can be cancelled, leaving the account listed', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('member@example.com');

    await user.click(within(rowFor('member@example.com')).getByRole('button', { name: /^delete$/i }));
    await user.click(within(rowFor('member@example.com')).getByRole('button', { name: /cancel/i }));

    expect(apiMocks.deleteAdminAccount).not.toHaveBeenCalled();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
  });

  it('shows the server message when the caller is not an admin', async () => {
    apiMocks.listAdminAccounts.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 403, data: { error: 'Admin access required.' } },
      })
    );
    renderAdmin();

    expect(await screen.findByText('Admin access required.')).toBeInTheDocument();
  });

  it('keeps the row and surfaces the reason when deletion fails', async () => {
    const user = userEvent.setup();
    apiMocks.deleteAdminAccount.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'You cannot delete your own admin account.' },
        },
      })
    );
    renderAdmin();
    await screen.findByText('member@example.com');

    await user.click(within(rowFor('member@example.com')).getByRole('button', { name: /^delete$/i }));
    await user.click(
      within(rowFor('member@example.com')).getByRole('button', { name: /confirm delete/i })
    );

    expect(
      await screen.findByText('You cannot delete your own admin account.')
    ).toBeInTheDocument();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
  });

  it('shows an empty state rather than a broken table', async () => {
    apiMocks.listAdminAccounts.mockResolvedValue({ items: [], total: 0 });
    renderAdmin();

    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });
});
