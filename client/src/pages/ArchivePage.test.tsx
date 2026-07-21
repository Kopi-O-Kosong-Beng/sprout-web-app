import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvatarRecord, PaginatedAvatars } from '../services/sproutApi';
import ArchivePage from './ArchivePage';

const apiMocks = vi.hoisted(() => ({
  listOwnedAvatars: vi.fn(),
  setDemoAvatars: vi.fn(),
}));

vi.mock('../services/sproutApi', () => apiMocks);

const emptyPage: PaginatedAvatars = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

function avatar(overrides: Partial<AvatarRecord> = {}): AvatarRecord {
  return {
    id: 'fern-1',
    userId: 'user-1',
    speciesName: 'Nephrolepis exaltata',
    speciesFamily: 'Nephrolepidaceae',
    spriteUrl: '/static/sprites/fern.png',
    discoveredAt: '2026-07-22T00:00:00.000Z',
    source: 'mobile',
    isTemporary: false,
    expiresAt: null,
    stats: { hp: 132, attack: 54, defense: 88, speed: 57 },
    metadata: { displayName: 'Fern Ward' },
    ...overrides,
  };
}

const collectedPage: PaginatedAvatars = {
  items: [
    avatar(),
    avatar({
      id: 'orchid-1',
      speciesName: 'Phalaenopsis aphrodite',
      speciesFamily: 'Orchidaceae',
      spriteUrl: '',
      stats: { hp: 96, attack: 86, defense: 42, speed: 81 },
      metadata: { displayName: 'Orchid Flare' },
    }),
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

const demoTemplateIds = [
  'demo-avatar-helianthus-annuus',
  'demo-avatar-quercus-robur',
  'demo-avatar-monstera-deliciosa',
  'demo-avatar-ficus-lyrata',
  'demo-avatar-amanita-muscaria',
] as const;

const demoPage: PaginatedAvatars = {
  items: demoTemplateIds.map((templateId, index) =>
    avatar({
      id: `demo-${index + 1}`,
      speciesName: `Demo species ${index + 1}`,
      speciesFamily: 'Demoaceae',
      spriteUrl: '',
      metadata: {
        isDemo: true,
        version: 'checkoff3-v1',
        templateId,
        displayName: `Demo Plant ${index + 1}`,
        presentationKey: `demo:${templateId}`,
      },
    })
  ),
  total: 5,
  page: 1,
  pageSize: 20,
};

const collectedAndDemoPage: PaginatedAvatars = {
  items: [...collectedPage.items, ...demoPage.items],
  total: collectedPage.total + demoPage.total,
  page: 1,
  pageSize: 20,
};

function BattleDestination() {
  const location = useLocation();
  const avatarId = (location.state as { avatarId?: string } | null)?.avatarId;
  return <p>Battle avatar {avatarId}</p>;
}

function renderArchive({ demoTools = false }: { demoTools?: boolean } = {}) {
  vi.stubEnv('VITE_ENABLE_DEMO_TOOLS', demoTools ? 'true' : 'false');
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={['/archive']}>
      <Routes>
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/battle" element={<BattleDestination />} />
      </Routes>
    </MemoryRouter>
  );
  return { ...view, user };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ArchivePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMocks.setDemoAvatars.mockResolvedValue(emptyPage);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows a stable loading state while the archive request is pending', async () => {
    const request = deferred<PaginatedAvatars>();
    apiMocks.listOwnedAvatars.mockReturnValue(request.promise);

    renderArchive();

    expect(screen.getByRole('status', { name: /loading archive/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /battle with/i })).not.toBeInTheDocument();

    await act(async () => request.resolve(emptyPage));
  });

  it('shows an empty archive for a new account', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(emptyPage);

    renderArchive();

    expect(await screen.findByText(/no plants collected yet/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /battle with/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /demo plants/i })).not.toBeInTheDocument();
  });

  it('shows selected owned avatar details and battles with that avatar', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(collectedPage);
    const { user } = renderArchive();

    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();
    expect(screen.getByText(/discovered on 22 Jul 2026/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /select orchid flare/i }));
    await user.click(screen.getByRole('button', { name: /battle with orchid flare/i }));

    expect(screen.getByText('Battle avatar orchid-1')).toBeVisible();
  });

  it('adds and removes only demo plants through the switch', async () => {
    apiMocks.listOwnedAvatars
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(demoPage)
      .mockResolvedValueOnce(emptyPage);
    const { user } = renderArchive({ demoTools: true });

    await user.click(
      await screen.findByRole('switch', { name: /add five demo plants/i })
    );
    expect(apiMocks.setDemoAvatars).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: /remove demo plants/i })
      ).toBeEnabled()
    );
    expect(screen.getAllByText('Demo')).toHaveLength(5);

    await user.click(screen.getByRole('switch', { name: /remove demo plants/i }));
    expect(apiMocks.setDemoAvatars).toHaveBeenCalledWith(false);
    expect(await screen.findByText(/no plants collected yet/i)).toBeVisible();
    expect(screen.queryByText('Demo')).not.toBeInTheDocument();
  });

  it('does not treat five unrelated v1 demo records as the exact demo set', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...demoPage,
      items: demoPage.items.map((record, index) => ({
        ...record,
        metadata: { ...record.metadata, templateId: `impostor-${index + 1}` },
      })),
    });

    renderArchive({ demoTools: true });

    expect(await screen.findAllByText('Demo')).toHaveLength(5);
    expect(
      screen.getByRole('switch', { name: /add five demo plants/i })
    ).toBeEnabled();
  });

  it('preserves collected plants when demo plants are removed', async () => {
    apiMocks.listOwnedAvatars
      .mockResolvedValueOnce(collectedAndDemoPage)
      .mockResolvedValueOnce(collectedPage);
    const { user } = renderArchive({ demoTools: true });

    await user.click(
      await screen.findByRole('switch', { name: /remove demo plants/i })
    );

    expect(apiMocks.setDemoAvatars).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();
    expect(screen.queryByText('Demo')).not.toBeInTheDocument();
  });

  it('locks the demo switch while the archive is mutating', async () => {
    const mutation = deferred<PaginatedAvatars>();
    apiMocks.listOwnedAvatars
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(demoPage);
    apiMocks.setDemoAvatars.mockReturnValue(mutation.promise);
    const { user } = renderArchive({ demoTools: true });
    const demoSwitch = await screen.findByRole('switch', {
      name: /add five demo plants/i,
    });

    await user.click(demoSwitch);

    expect(demoSwitch).toBeDisabled();
    expect(screen.getByRole('status', { name: /updating demo plants/i })).toBeVisible();

    await act(async () => mutation.resolve(demoPage));
    expect(
      await screen.findByRole('switch', { name: /remove demo plants/i })
    ).toBeEnabled();
  });

  it('shows retry after an archive request fails', async () => {
    apiMocks.listOwnedAvatars
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(collectedPage);
    const { user } = renderArchive();

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(retry).toBeVisible();
    expect(screen.getByText('offline')).toBeVisible();

    await user.click(retry);

    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();
  });

  it('falls back to the CSS plant when a sprite image fails', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [collectedPage.items[0]],
      total: 1,
    });
    renderArchive();
    const visual = (await screen.findAllByRole('img', {
      name: /fern ward avatar/i,
    }))[0];
    const sprite = visual.querySelector('img');

    expect(sprite).not.toBeNull();
    fireEvent.error(sprite!);

    expect(visual.querySelector('img')).toBeNull();
    expect(visual.querySelector('.leaf')).not.toBeNull();
  });
});
