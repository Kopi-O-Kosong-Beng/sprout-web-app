import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationLockProvider } from '../context/NavigationLockProvider';
import type { AvatarRecord, PaginatedAvatars } from '../services/sproutApi';
import ArchivePage from './ArchivePage';
import BattlePage from './BattlePage';

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
    battleEligible: true,
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

function renderArchive({ demoTools = false }: { demoTools?: boolean } = {}) {
  vi.stubEnv('VITE_ENABLE_DEMO_TOOLS', demoTools ? 'true' : 'false');
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={['/archive']}>
      <NavigationLockProvider>
        <Routes>
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/battle" element={<BattlePage />} />
        </Routes>
      </NavigationLockProvider>
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

  it('loads every owned avatar and detects demos beyond the first 100 records', async () => {
    const firstPageItems = [
      ...Array.from({ length: 96 }, (_, index) =>
        avatar({
          id: `owned-${index + 1}`,
          spriteUrl: '',
          metadata: { displayName: `Owned Plant ${index + 1}` },
        })
      ),
      ...demoPage.items.slice(0, 4),
    ];
    const laterOwned = avatar({
      id: 'later-owned',
      spriteUrl: '',
      metadata: { displayName: 'Later Owned Plant' },
    });
    apiMocks.listOwnedAvatars.mockImplementation((page: number) => {
      if (page === 1) {
        return Promise.resolve({
          items: firstPageItems,
          total: 102,
          page: 1,
          pageSize: 100,
        });
      }
      if (page === 2) {
        return Promise.resolve({
          items: [demoPage.items[4], laterOwned],
          total: 102,
          page: 2,
          pageSize: 100,
        });
      }
      throw new Error(`Unexpected archive page ${page}`);
    });

    renderArchive({ demoTools: true });

    expect(
      await screen.findByRole('button', { name: /select later owned plant/i })
    ).toBeVisible();
    expect(
      screen.getByRole('switch', { name: /remove demo plants/i })
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('button', { name: /\(demo\)$/i })).toHaveLength(5);
    expect(screen.getAllByText('Demo')).toHaveLength(5);
    expect(apiMocks.listOwnedAvatars.mock.calls).toEqual([
      [1, 100],
      [2, 100],
    ]);
  });

  it.each([
    [
      'an empty page',
      { items: [], total: 2, page: 2, pageSize: 100 } as PaginatedAvatars,
    ],
    [
      'a non-advancing page',
      {
        items: [avatar({ id: 'duplicate-fern' })],
        total: 2,
        page: 1,
        pageSize: 100,
      } as PaginatedAvatars,
    ],
  ])('stops pagination defensively after %s', async (_case, secondPage) => {
    apiMocks.listOwnedAvatars
      .mockResolvedValueOnce({
        items: [avatar()],
        total: 2,
        page: 1,
        pageSize: 100,
      })
      .mockResolvedValueOnce(secondPage);

    renderArchive();

    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();
    await waitFor(() => expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(2));
    expect(apiMocks.listOwnedAvatars.mock.calls).toEqual([
      [1, 100],
      [2, 100],
    ]);
  });

  it('hands the selected owned Fern Ward avatar to the real Battle page', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(collectedPage);
    const { user } = renderArchive();

    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();
    expect(screen.getByText(/discovered on 22 Jul 2026/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /select orchid flare/i }));
    expect(screen.getByRole('heading', { name: 'Orchid Flare' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /select fern ward/i }));
    await user.click(screen.getByRole('button', { name: /battle with fern ward/i }));

    expect(
      screen.getByRole('heading', { name: /fern ward is ready/i })
    ).toBeVisible();
    expect(screen.queryByText('Monstera Scout')).not.toBeInTheDocument();
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

  it('does not refresh the archive after an in-flight mutation is unmounted', async () => {
    const mutation = deferred<PaginatedAvatars>();
    apiMocks.listOwnedAvatars.mockResolvedValue(emptyPage);
    apiMocks.setDemoAvatars.mockReturnValue(mutation.promise);
    const { unmount, user } = renderArchive({ demoTools: true });

    await user.click(
      await screen.findByRole('switch', { name: /add five demo plants/i })
    );
    unmount();
    await act(async () => mutation.resolve(demoPage));

    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(1);
  });

  it('does not refresh after a rejected demo mutation', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(emptyPage);
    apiMocks.setDemoAvatars.mockRejectedValue(new Error('mutation rejected'));
    const { user } = renderArchive({ demoTools: true });

    await user.click(
      await screen.findByRole('switch', { name: /add five demo plants/i })
    );

    expect(await screen.findByText('mutation rejected')).toBeVisible();
    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(1);
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

  it('falls back to the empty pot when a sprite image fails', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [collectedPage.items[0]],
      total: 1,
    });
    renderArchive();
    const visual = (await screen.findAllByRole('img', {
      name: /fern ward avatar/i,
    }))[0];
    const sprite = visual.querySelector('.plant-sprite');

    expect(sprite).not.toBeNull();
    fireEvent.error(sprite!);

    // The pixel-art redesign draws the pot as a real painted asset and stands
    // the sprite in it, so a broken sprite leaves the pot rather than the
    // CSS-art leaf/face/pot spans this used to assert on.
    expect(visual.querySelector('.plant-sprite')).toBeNull();
    expect(visual.querySelector('.pot-art')).not.toBeNull();
  });
});

describe('ArchivePage species detail (UC4 step 3)', () => {
  it('shows habitat and conservation status when the record carries them', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [
        avatar({
          metadata: {
            displayName: 'Fern Ward',
            habitat: 'Shaded tropical understorey',
            conservationStatus: 'Least Concern',
          },
        }),
      ],
      total: 1,
    });
    renderArchive();

    expect(await screen.findByText('Shaded tropical understorey')).toBeInTheDocument();
    expect(screen.getByText('Least Concern')).toBeInTheDocument();
  });

  it('omits the facts list entirely for records without those fields', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [avatar()],
      total: 1,
    });
    renderArchive();

    await screen.findByRole('button', { name: /battle with fern ward/i });
    expect(screen.queryByText('Habitat')).not.toBeInTheDocument();
    expect(screen.queryByText('Conservation status')).not.toBeInTheDocument();
  });
});
