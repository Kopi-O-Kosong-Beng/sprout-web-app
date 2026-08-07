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
  deleteAvatar: vi.fn(),
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
    spriteUrl: '/plants/SPRITE_Fern.png',
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

  /**
   * The specimen card keyed PlantAvatar and SpecimenPhoto on the bare avatar
   * id. They are siblings, so both carried the same key: React warned about
   * duplicate keys and then duplicated rather than replaced them, so every
   * selection left the previous plant's sprite and pot behind and the card
   * grew a stack. Deleting did it too, since removing a plant reselects.
   */
  it('shows only the selected plant on the card after switching', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(collectedPage);
    const { user } = renderArchive();

    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();

    const card = () => screen.getByRole('heading', { name: /Ward|Flare|Scout/ }).closest('.pixel-panel')!;
    const spritesOn = (element: Element) =>
      Array.from(element.querySelectorAll('img.plant-sprite'));

    await user.click(screen.getByRole('button', { name: /select orchid flare/i }));
    await user.click(screen.getByRole('button', { name: /select fern ward/i }));
    await user.click(screen.getByRole('button', { name: /select orchid flare/i }));
    await user.click(screen.getByRole('button', { name: /select fern ward/i }));

    // One creature on the card, and it is the one just chosen.
    expect(spritesOn(card())).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Fern Ward' })).toBeVisible();
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

    expect(
      await screen.findByText(/couldn't reach your plant archive/i)
    ).toBeVisible();
    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(1);
  });

  it('digs up one plant through the shovel after confirming', async () => {
    const orchidOnlyPage: PaginatedAvatars = {
      ...collectedPage,
      items: collectedPage.items.slice(1),
      total: 1,
    };
    apiMocks.listOwnedAvatars
      .mockResolvedValueOnce(collectedPage)
      .mockResolvedValueOnce(orchidOnlyPage);
    apiMocks.deleteAvatar.mockResolvedValue(undefined);
    const { user } = renderArchive();

    await user.click(await screen.findByRole('button', { name: /^remove plants$/i }));
    expect(screen.getByText(/tap a plant to dig it up/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /dig up fern ward/i }));
    await user.click(
      screen.getByRole('button', { name: /^dig up$/i })
    );

    expect(apiMocks.deleteAvatar).toHaveBeenCalledWith('fern-1');
    expect(await screen.findByRole('heading', { name: 'Orchid Flare' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /dig up fern ward/i })
    ).not.toBeInTheDocument();
  });

  it('keeps the plant when the dig is cancelled', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(collectedPage);
    const { user } = renderArchive();

    await user.click(await screen.findByRole('button', { name: /^remove plants$/i }));
    await user.click(screen.getByRole('button', { name: /dig up fern ward/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(apiMocks.deleteAvatar).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dig up fern ward/i })).toBeVisible();
  });

  it('says why a dig failed and leaves the dialog open', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(collectedPage);
    apiMocks.deleteAvatar.mockRejectedValue(new Error('dig rejected'));
    const { user } = renderArchive();

    await user.click(await screen.findByRole('button', { name: /^remove plants$/i }));
    await user.click(screen.getByRole('button', { name: /dig up fern ward/i }));
    await user.click(screen.getByRole('button', { name: /^dig up$/i }));

    expect(await screen.findByText('dig rejected')).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();
    // Only the first load — a failed dig must not silently reshuffle shelves.
    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(1);
  });

  it('offers no shovel over an empty archive', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue(emptyPage);
    renderArchive();

    expect(await screen.findByText(/no plants collected yet/i)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^remove plants$/i })
    ).not.toBeInTheDocument();
  });

  it('shows retry after an archive request fails', async () => {
    apiMocks.listOwnedAvatars
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(collectedPage);
    const { user } = renderArchive();

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(retry).toBeVisible();
    expect(screen.getByText(/couldn't reach your plant archive/i)).toBeVisible();

    await user.click(retry);

    expect(await screen.findByRole('heading', { name: 'Fern Ward' })).toBeVisible();
  });

  it('stands a drawn plant in the pot when a sprite image fails', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [collectedPage.items[0]],
      total: 1,
    });
    renderArchive();
    const visual = (await screen.findAllByRole('img', {
      name: /fern ward avatar/i,
    }))[0];
    const sprite = visual.querySelector('img.plant-sprite');

    expect(sprite).not.toBeNull();
    fireEvent.error(sprite!);

    // A broken sprite URL used to leave a silently bare pot — which is how
    // missing art shipped twice without anyone noticing. Now the procedural
    // stand-in takes the sprite's place while the pot stays painted.
    expect(visual.querySelector('img.plant-sprite')).toBeNull();
    expect(visual.querySelector('svg.plant-sprite.is-procedural')).not.toBeNull();
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

  it('labels an IRL scan and says nothing about expiry', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [avatar({ source: 'mobile', isTemporary: false, expiresAt: null })],
      total: 1,
    });
    renderArchive();

    const badges = await screen.findAllByTestId('capture-badge');
    // By test id, not text: the Filter/Sort toolbar's Source toggle also has
    // a "Web Upload" button, and matching on text alone (even scoped to a
    // `span`) is fragile against that unrelated control ever changing tag.
    // Two badges render for one avatar — shelf pot and detail card — so this
    // checks every one rather than a single query that would throw on the
    // second match.
    expect(badges.length).toBeGreaterThan(0);
    badges.forEach((badge) => expect(badge).toHaveTextContent('IRL Scan'));
    expect(screen.queryByText(/expires in/i)).not.toBeInTheDocument();
  });

  it('labels a live web upload with the time it has left', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [
        avatar({
          source: 'web',
          isTemporary: true,
          expiresAt,
          battleEligible: true,
        }),
      ],
      total: 1,
    });
    renderArchive();

    expect(await screen.findAllByText('Web Upload')).not.toHaveLength(0);
    expect(screen.getByText('Expires in 5 hours')).toBeInTheDocument();
  });

  // Expiry is the server's call: an expired upload drops out of the battle
  // picker, and the card has to say why rather than leaving it a mystery.
  it('marks an expired web upload as unbattleable', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [
        avatar({
          source: 'web',
          isTemporary: true,
          expiresAt: '2020-01-01T00:00:00.000Z',
          battleEligible: false,
        }),
      ],
      total: 1,
    });
    renderArchive();

    expect(
      await screen.findByText('Expired — can no longer battle')
    ).toBeInTheDocument();
  });

  it('shows the photograph a hand-drawn sprite came from', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [
        avatar({
          speciesName: 'Monstera deliciosa',
          spriteUrl: '/plants/SPRITE_Monstera.png',
          metadata: {
            displayName: 'Monstera deliciosa',
            photoUrl: '/plants/IMG_Monstera.jpg',
          },
        }),
      ],
      total: 1,
    });
    renderArchive();

    const photo = await screen.findByAltText('Photograph of Monstera deliciosa');
    expect(photo).toHaveAttribute('src', '/plants/IMG_Monstera.jpg');
  });

  // A scanned plant keeps no photo, and a demo plant whose art has not been
  // added yet must not leave a broken image on the card.
  it('omits the photograph for records without one', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      ...collectedPage,
      items: [avatar()],
      total: 1,
    });
    renderArchive();

    await screen.findByRole('button', { name: /battle with fern ward/i });
    expect(screen.queryByText('Photographed')).not.toBeInTheDocument();
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

describe('ArchivePage sort options', () => {
  /**
   * All 12 sort options must produce pairwise-distinct orderings — with fewer
   * than 4 avatars several options coincidentally collide on the same order,
   * which would hide a mis-wired comparator (e.g. attack-desc silently reusing
   * hp's). Insertion order below (Basil, Cactus, Dahlia, Aloe) is deliberately
   * not equal to any of the 12 expected orders, so a `default: return 0` no-op
   * bug in the switch is caught too, not just a swapped comparator.
   */
  const AVATARS = {
    aloe: avatar({
      id: 'aloe',
      metadata: { displayName: 'Aloe' },
      discoveredAt: '2026-01-01T00:00:00.000Z',
      stats: { hp: 60, attack: 55, defense: 120, speed: 70 },
    }),
    basil: avatar({
      id: 'basil',
      metadata: { displayName: 'Basil' },
      discoveredAt: '2026-03-01T00:00:00.000Z',
      stats: { hp: 150, attack: 40, defense: 90, speed: 100 },
    }),
    cactus: avatar({
      id: 'cactus',
      metadata: { displayName: 'Cactus' },
      discoveredAt: '2026-02-01T00:00:00.000Z',
      stats: { hp: 30, attack: 150, defense: 60, speed: 30 },
    }),
    dahlia: avatar({
      id: 'dahlia',
      metadata: { displayName: 'Dahlia' },
      discoveredAt: '2026-04-01T00:00:00.000Z',
      stats: { hp: 100, attack: 90, defense: 150, speed: 140 },
    }),
  };

  const SORT_PAGE: PaginatedAvatars = {
    items: [AVATARS.basil, AVATARS.cactus, AVATARS.dahlia, AVATARS.aloe],
    total: 4,
    page: 1,
    pageSize: 100,
  };

  const EXPECTED_ORDER: [string, string[]][] = [
    ['discovered-newest', ['Dahlia', 'Basil', 'Cactus', 'Aloe']],
    ['discovered-oldest', ['Aloe', 'Cactus', 'Basil', 'Dahlia']],
    ['hp-desc', ['Basil', 'Dahlia', 'Aloe', 'Cactus']],
    ['hp-asc', ['Cactus', 'Aloe', 'Dahlia', 'Basil']],
    ['attack-desc', ['Cactus', 'Dahlia', 'Aloe', 'Basil']],
    ['attack-asc', ['Basil', 'Aloe', 'Dahlia', 'Cactus']],
    ['defense-desc', ['Dahlia', 'Aloe', 'Basil', 'Cactus']],
    ['defense-asc', ['Cactus', 'Basil', 'Aloe', 'Dahlia']],
    ['speed-desc', ['Dahlia', 'Basil', 'Aloe', 'Cactus']],
    ['speed-asc', ['Cactus', 'Aloe', 'Basil', 'Dahlia']],
    ['name-asc', ['Aloe', 'Basil', 'Cactus', 'Dahlia']],
    ['name-desc', ['Dahlia', 'Cactus', 'Basil', 'Aloe']],
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    apiMocks.listOwnedAvatars.mockResolvedValue(SORT_PAGE);
  });

  it.each(EXPECTED_ORDER)('orders the shelf by %s', async (sortOption, expectedNames) => {
    const { user } = renderArchive();

    // The default sort (discovered-newest) is already applied to the initial
    // render, so this can't wait on a specific pot/heading without begging
    // the question of what order is under test — wait on the Filter button
    // instead, which only renders once the archive has settled with data.
    await user.click(await screen.findByRole('button', { name: /^filter$/i }));
    await user.selectOptions(screen.getByLabelText(/sort by/i), sortOption);

    const potNames = screen
      .getAllByRole('button', { name: /^Select /i })
      .map((button) => button.getAttribute('aria-label'));

    expect(potNames).toEqual(expectedNames.map((name) => `Select ${name}`));
  });
});
