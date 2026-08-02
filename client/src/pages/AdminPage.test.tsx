import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage';

const apiMocks = vi.hoisted(() => ({
  listAdminAccounts: vi.fn(),
  deleteAdminAccount: vi.fn(),
  getAdminAlmanac: vi.fn(),
  getApiHealth: vi.fn(),
  runAdminCleanup: vi.fn(),
}));

vi.mock('../services/sproutApi', () => apiMocks);

const ALMANAC = {
  source: 'Chong, Tan & Corlett (2009)',
  total: 200,
  discovered: 1,
  species: [
    {
      id: 'fagraea-fragrans',
      speciesName: 'Fagraea fragrans',
      commonName: 'Tembusu',
      family: 'Gentianaceae',
      status: 'common' as const,
      origin: 'native',
      growthForm: 'tree',
      discovered: true,
      discoveryCount: 3,
      discoveredByName: 'NatTheBotanist',
      discoveredAt: '2026-08-01T00:00:00.000Z',
      photoUrl: null,
    },
    {
      id: 'acanthus-ilicifolius',
      speciesName: 'Acanthus ilicifolius',
      commonName: 'Sea holly',
      family: 'Acanthaceae',
      status: 'common' as const,
      origin: 'native',
      growthForm: 'shrub',
      discovered: false,
      discoveryCount: 0,
      discoveredByName: null,
      discoveredAt: null,
      photoUrl: null,
    },
  ],
  offTaxonomy: [],
};

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

/** The happy-path API stubs both suites start from. */
function stubApiDefaults() {
  vi.clearAllMocks();
  apiMocks.listAdminAccounts.mockResolvedValue(ACCOUNTS);
  apiMocks.getAdminAlmanac.mockResolvedValue(ALMANAC);
  apiMocks.getApiHealth.mockResolvedValue({
    timestamp: '2026-08-02T10:00:00.000Z',
    overallStatus: 'DEGRADED',
    probes: {
      plantId: { status: 'PASS', latencyMs: 412, detail: '460 credits left' },
      // Flux is billed per render, so the endpoint reports it unprobed with an
      // explicit null latency rather than a number nobody measured.
      flux: { status: 'SKIP', latencyMs: null, detail: 'key present — not probed' },
    },
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    stubApiDefaults();
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

describe('AdminPage operations panels', () => {
  beforeEach(stubApiDefaults);

  it('probes API health on request rather than on load', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('member@example.com');

    // Each probe is a live upstream call, so opening the page must not fire them.
    expect(apiMocks.getApiHealth).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /run health check/i }));

    expect(await screen.findByText('plantId')).toBeInTheDocument();
    expect(screen.getByText('460 credits left')).toBeInTheDocument();
    expect(screen.getByText('412 ms')).toBeInTheDocument();
    // SKIP is not a failure — an unprobed or unconfigured hop degrades, and the
    // page says which rather than showing green for something it never called.
    expect(screen.getByText('key present — not probed')).toBeInTheDocument();
    // null latency must read as "not measured", never as "null ms" or 0.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('will not delete on a single press', async () => {
    apiMocks.runAdminCleanup.mockResolvedValue({
      target: 'expired-temp-avatars',
      dryRun: true,
      matched: 2,
      deleted: 0,
      sample: [{ id: 'a1', label: 'Lantana camara', detail: 'expired yesterday' }],
      ranAt: '2026-08-02T10:00:00.000Z',
    });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('member@example.com');

    await user.click(screen.getByRole('button', { name: /check what would be deleted/i }));

    expect(apiMocks.runAdminCleanup).toHaveBeenCalledWith('expired-temp-avatars', {
      dryRun: true,
    });
    expect(
      await screen.findByText(/2 expired uploads match\. Nothing has been deleted\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Lantana camara/)).toBeInTheDocument();
  });

  it('deletes only after the second, explicit press', async () => {
    apiMocks.runAdminCleanup
      .mockResolvedValueOnce({
        target: 'expired-temp-avatars',
        dryRun: true,
        matched: 2,
        deleted: 0,
        sample: [],
        ranAt: '2026-08-02T10:00:00.000Z',
      })
      .mockResolvedValueOnce({
        target: 'expired-temp-avatars',
        dryRun: false,
        matched: 2,
        deleted: 2,
        sample: [],
        ranAt: '2026-08-02T10:00:01.000Z',
      });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('member@example.com');

    await user.click(screen.getByRole('button', { name: /check what would be deleted/i }));
    await user.click(await screen.findByRole('button', { name: /delete 2 expired uploads/i }));

    expect(apiMocks.runAdminCleanup).toHaveBeenLastCalledWith('expired-temp-avatars', {
      dryRun: false,
    });
    expect(await screen.findByText(/Deleted 2 expired uploads\./i)).toBeInTheDocument();
  });

  it('shows the taxonomy with who found what', async () => {
    renderAdmin();

    expect(await screen.findByText(/1 of 200 species discovered/i)).toBeInTheDocument();
    expect(screen.getByText('NatTheBotanist')).toBeInTheDocument();
    expect(screen.getAllByText('Fagraea fragrans').length).toBeGreaterThan(0);
    expect(screen.getByText('Not yet found')).toBeInTheDocument();
  });
});
