import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvatarRecord,
  BattleActionResult,
  BattleMove,
  BattleSession,
  PaginatedAvatars,
} from '../services/sproutApi';
import { NavigationLockProvider } from '../context/NavigationLockProvider';
import BattlePage from './BattlePage';

const apiMocks = vi.hoisted(() => ({
  abandonPveBattle: vi.fn(),
  getPveBattle: vi.fn(),
  listOwnedAvatars: vi.fn(),
  startPveBattle: vi.fn(),
  submitPveAction: vi.fn(),
}));

vi.mock('../services/sproutApi', () => apiMocks);

const playerMoves: BattleMove[] = [
  {
    id: 'vine-tap',
    name: 'Vine Tap',
    kind: 'quick',
    power: 18,
    accuracy: 100,
    energyGain: 1,
    energyCost: 0,
  },
  {
    id: 'guard-root',
    name: 'Guard Root',
    kind: 'guard',
    power: 0,
    accuracy: 100,
    energyGain: 1,
    energyCost: 0,
  },
  {
    id: 'solar-lance',
    name: 'Solar Lance',
    kind: 'signature',
    power: 42,
    accuracy: 85,
    energyGain: 0,
    energyCost: 2,
  },
  {
    id: 'photosynthesis',
    name: 'Photosynthesis',
    kind: 'heal',
    power: 0,
    accuracy: 100,
    energyGain: 0,
    energyCost: 0,
  },
];

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

const rosterPage: PaginatedAvatars = {
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
  pageSize: 100,
};

type SessionOptions = Omit<
  Partial<BattleSession>,
  'player' | 'bot' | 'log'
> & {
  player?: Partial<BattleSession['player']>;
  bot?: Partial<BattleSession['bot']>;
  log?: BattleSession['log'];
};

function battleSession(options: SessionOptions = {}): BattleSession {
  const status = options.status ?? 'active';
  const player = {
    id: 'fern-1',
    name: 'Fern Ward',
    spriteUrl: '/battle/fern.png',
    stats: { hp: 132, attack: 54, defense: 88, speed: 57 },
    currentHp: 101,
    maxHp: 132,
    energy: 1,
    maxEnergy: 2,
    healUsed: false,
    moves: playerMoves,
    ...options.player,
  };
  const bot = {
    id: 'thornback-v1',
    name: 'Thornback',
    spriteUrl: '/sprites/thornback.png',
    stats: { hp: 140, attack: 66, defense: 72, speed: 43 },
    currentHp: 118,
    maxHp: 140,
    energy: 0,
    maxEnergy: 2,
    healUsed: false,
    ...options.bot,
  };

  return {
    id: 'battle-1',
    avatarId: 'fern-1',
    status,
    phase: status === 'active' ? 'PLAYER_ACTION' : 'TERMINAL',
    turnNumber: 1,
    botIntent: status === 'active' ? 'building' : null,
    log: options.log ?? [
      {
        turnNumber: 0,
        type: 'battle_started',
        actor: 'system',
        message: 'Battle started.',
      },
      {
        turnNumber: 1,
        type: 'bot_intent_prepared',
        actor: 'bot',
        intent: 'building',
        message: 'Opponent intent prepared.',
      },
    ],
    xpAwarded: status === 'won' ? 20 : status === 'lost' ? 5 : 0,
    createdAt: '2026-07-23T01:00:00.000Z',
    updatedAt: '2026-07-23T01:00:01.000Z',
    completedAt:
      status === 'active' ? null : '2026-07-23T01:00:02.000Z',
    ...options,
    player,
    bot,
  };
}

function actionResult(
  session: BattleSession,
  stale = false
): BattleActionResult {
  return { session, stale };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderBattle(routeState?: unknown) {
  const user = userEvent.setup();
  const initialEntry = routeState
    ? { pathname: '/battle', state: routeState }
    : '/battle';
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NavigationLockProvider>
        <Routes>
          <Route path="/battle" element={<BattlePage />} />
          <Route path="/archive" element={<p>Owned archive destination</p>} />
        </Routes>
      </NavigationLockProvider>
    </MemoryRouter>
  );
  return { ...view, user };
}

function RouteStateHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          navigate('/battle', { state: { avatarId: 'orchid-1' } })
        }
      >
        Select route Orchid
      </button>
      <BattlePage />
    </>
  );
}

async function enterActiveBattle(session = battleSession()) {
  // An earlier battle in the same test leaves its resume pointer behind, and
  // this helper's contract is the roster → Start Match path, not a resume.
  sessionStorage.removeItem('sprout.battle.sessionId');
  apiMocks.startPveBattle.mockResolvedValueOnce(session);
  const view = renderBattle({ avatarId: 'fern-1' });
  await view.user.click(
    await screen.findByRole('button', { name: /start match/i })
  );
  expect(
    await screen.findByRole('heading', {
      name: new RegExp(`turn ${session.turnNumber}`, 'i'),
    })
  ).toBeVisible();
  return view;
}

/** Abandon is a two-step gesture now — it asks before it ends the match. The
 *  tests that are about what abandoning DOES go through both steps here, so
 *  the confirmation is asserted in one place (the tests that own it) rather
 *  than re-asserted in every one of them. */
async function confirmAbandon(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /abandon match/i }));
  await user.click(
    screen.getByRole('button', { name: /abandon, lose progress/i })
  );
}

describe('BattlePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // A finished test's battle leaves its resume pointer behind; without this
    // the next test would mount into a resumed session instead of the roster.
    sessionStorage.clear();
    apiMocks.listOwnedAvatars.mockResolvedValue(rosterPage);
    apiMocks.startPveBattle.mockResolvedValue(battleSession());
    apiMocks.getPveBattle.mockResolvedValue(battleSession());
    apiMocks.submitPveAction.mockResolvedValue(
      actionResult(battleSession({ turnNumber: 2 }))
    );
    apiMocks.abandonPveBattle.mockResolvedValue(
      battleSession({ status: 'abandoned' })
    );
  });

  it('loads every owned avatar on a direct visit and waits for a selection', async () => {
    apiMocks.listOwnedAvatars
      .mockResolvedValueOnce({
        items: [avatar()],
        total: 2,
        page: 1,
        pageSize: 100,
      })
      .mockResolvedValueOnce({
        items: [rosterPage.items[1]],
        total: 2,
        page: 2,
        pageSize: 100,
      });

    renderBattle();

    expect(
      await screen.findByRole('button', { name: /select orchid flare/i })
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /start match/i })).not.toBeInTheDocument();
    expect(apiMocks.listOwnedAvatars.mock.calls).toEqual([
      [1, 100],
      [2, 100],
    ]);
  });

  it('preselects only a route avatar ID found in the owned roster and ignores route avatar data', async () => {
    renderBattle({
      avatarId: 'fern-1',
      avatar: { id: 'fern-1', name: 'Forged Route Plant', hp: 9999 },
    });

    expect(
      await screen.findByRole('heading', { name: /fern ward is ready/i })
    ).toBeVisible();
    expect(screen.queryByText(/forged route plant/i)).not.toBeInTheDocument();
    expect(screen.queryByText('9999')).not.toBeInTheDocument();
  });

  it('does not preselect an invalid route avatar ID', async () => {
    renderBattle({ avatarId: 'not-owned' });

    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /start match/i })).not.toBeInTheDocument();
    expect(screen.getByText(/choose an owned plant for this match/i)).toBeVisible();
  });

  it('uses only server battle eligibility before validating the preferred route ID', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      items: [
        avatar({
          id: 'ineligible-future',
          isTemporary: true,
          expiresAt: '2999-01-01T00:00:00.000Z',
          battleEligible: false,
          metadata: { displayName: 'Future Locked Fern' },
        }),
        avatar({
          id: 'eligible-expired',
          isTemporary: true,
          expiresAt: '2020-01-01T00:00:00.000Z',
          battleEligible: true,
          metadata: { displayName: 'Server Approved Ivy' },
        }),
        avatar({
          id: 'ineligible-permanent',
          isTemporary: false,
          expiresAt: null,
          battleEligible: false,
          metadata: { displayName: 'Locked Permanent Pine' },
        }),
        avatar({
          id: 'eligible-invalid-expiry',
          isTemporary: true,
          expiresAt: 'not-a-timestamp',
          battleEligible: true,
          metadata: { displayName: 'Legacy Timestamp Orchid' },
        }),
      ],
      total: 4,
      page: 1,
      pageSize: 100,
    });

    renderBattle({ avatarId: 'ineligible-future' });

    expect(
      await screen.findByRole('button', {
        name: /select server approved ivy/i,
      })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /select legacy timestamp orchid/i })
    ).toBeVisible();
    expect(screen.queryByText(/future locked fern/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/locked permanent pine/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /start match/i })
    ).not.toBeInTheDocument();
  });

  it('shows the true empty-roster path when every avatar is server-ineligible', async () => {
    apiMocks.listOwnedAvatars.mockResolvedValue({
      items: [
        avatar({
          id: 'future-but-ineligible',
          isTemporary: true,
          expiresAt: '2999-01-01T00:00:00.000Z',
          battleEligible: false,
        }),
        avatar({
          id: 'permanent-but-ineligible',
          isTemporary: false,
          expiresAt: null,
          battleEligible: false,
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });

    renderBattle({ avatarId: 'future-but-ineligible' });

    expect(
      await screen.findByRole('heading', { name: /no battle plants yet/i })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /start match/i })
    ).not.toBeInTheDocument();
  });

  it('shows an empty-roster path when the user owns no avatars', async () => {
    const user = userEvent.setup();
    apiMocks.listOwnedAvatars.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    });
    renderBattle();

    expect(
      await screen.findByRole('heading', { name: /no battle plants yet/i })
    ).toBeVisible();
    expect(screen.queryByText('Monstera Scout')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /return to archive/i }));
    expect(screen.getByText('Owned archive destination')).toBeVisible();
  });

  it('retries a failed roster load', async () => {
    apiMocks.listOwnedAvatars
      .mockRejectedValueOnce(new Error('Roster network unavailable.'))
      .mockResolvedValueOnce(rosterPage);
    const { user } = renderBattle();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Roster network unavailable.'
    );
    await user.click(screen.getByRole('button', { name: /retry roster/i }));

    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(2);
  });

  it('stops a multi-page roster load after unmount', async () => {
    const request = deferred<PaginatedAvatars>();
    apiMocks.listOwnedAvatars.mockReturnValue(request.promise);
    const view = renderBattle();

    view.unmount();
    await act(async () =>
      request.resolve({
        items: [avatar()],
        total: 2,
        page: 1,
        pageSize: 100,
      })
    );

    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(1);
  });

  it('prevents an older roster response from overwriting newer route selection', async () => {
    const firstRequest = deferred<PaginatedAvatars>();
    apiMocks.listOwnedAvatars
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(rosterPage);
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/battle', state: { avatarId: 'fern-1' } },
        ]}
      >
        <NavigationLockProvider>
          <Routes>
            <Route path="/battle" element={<RouteStateHarness />} />
          </Routes>
        </NavigationLockProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /select route orchid/i }));

    expect(
      await screen.findByRole('heading', { name: /orchid flare is ready/i })
    ).toBeVisible();
    await act(async () =>
      firstRequest.resolve({
        items: [avatar()],
        total: 1,
        page: 1,
        pageSize: 100,
      })
    );
    expect(
      screen.getByRole('heading', { name: /orchid flare is ready/i })
    ).toBeVisible();
    expect(apiMocks.listOwnedAvatars).toHaveBeenCalledTimes(2);
  });

  it('starts a persisted battle with the selected owned avatar', async () => {
    const request = deferred<BattleSession>();
    apiMocks.startPveBattle.mockReturnValue(request.promise);
    const { user } = renderBattle();

    await user.click(
      await screen.findByRole('button', { name: /select orchid flare/i })
    );
    await user.click(screen.getByRole('button', { name: /start match/i }));

    expect(apiMocks.startPveBattle).toHaveBeenCalledWith('orchid-1');
    expect(screen.getByRole('status', { name: /starting battle/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /start match/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /select fern ward/i })).toBeDisabled();
    const archiveControl = screen.getByText(/return to archive/i);
    expect(archiveControl).toHaveAttribute('aria-disabled', 'true');
    expect(archiveControl.closest('a')).toBeNull();
    await user.click(archiveControl);
    expect(
      screen.queryByText('Owned archive destination')
    ).not.toBeInTheDocument();

    await act(async () =>
      request.resolve(
        battleSession({
          avatarId: 'orchid-1',
          player: { id: 'orchid-1', name: 'Orchid Flare' },
        })
      )
    );
    expect(
      await screen.findByRole('heading', { name: /turn 1/i })
    ).toBeVisible();
  });

  it('retries a failed battle start without losing the selection', async () => {
    apiMocks.startPveBattle
      .mockRejectedValueOnce(new Error('Could not create the match.'))
      .mockResolvedValueOnce(battleSession());
    const { user } = renderBattle({ avatarId: 'fern-1' });

    await user.click(
      await screen.findByRole('button', { name: /start match/i })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create the match.'
    );
    expect(screen.getByRole('heading', { name: /fern ward is ready/i })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /retry start/i }));
    expect(
      await screen.findByRole('heading', { name: /turn 1/i })
    ).toBeVisible();
    expect(apiMocks.startPveBattle.mock.calls).toEqual([
      ['fern-1'],
      ['fern-1'],
    ]);
  });

  it('renders bounded server HP, server-defined Sun, broad intent, and every public move field', async () => {
    await enterActiveBattle(
      battleSession({
        turnNumber: 7,
        botIntent: 'committed',
        player: {
          currentHp: 155,
          maxHp: 132,
          energy: 9,
          maxEnergy: 5,
        },
        bot: { currentHp: -4, maxHp: 140, energy: -2, maxEnergy: 3 },
      })
    );

    expect(screen.getByRole('progressbar', { name: /fern ward hp 132 of 132/i })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: /thornback hp 0 of 140/i })).toBeVisible();
    // Sun is drawn as pips; the accessible name is what carries the value now.
    expect(screen.getByRole('img', { name: /fern ward sun 5 of 5/i })).toBeVisible();
    expect(screen.getByRole('img', { name: /thornback sun 0 of 3/i })).toBeVisible();
    expect(screen.getByText(/committed to a decisive action/i)).toBeVisible();
    // Standing intel: turn order from the speed comparison (57 vs 43 here,
    // ties go to the player) and the opponent's once-per-battle recovery.
    expect(screen.getByText('Fern Ward acts first each round')).toBeVisible();
    expect(screen.getByText('Thornback still holds a recovery')).toBeVisible();
    // The serializer now publishes Thornback's rendered art, so the opponent
    // stands in its pot as a real sprite <img>, not a bare pot.
    expect(
      screen
        .getByRole('img', { name: /thornback avatar/i })
        .querySelector('img.plant-sprite')
    ).not.toBeNull();

    const moves = screen.getByRole('group', { name: /battle moves/i });

    // Every public field still reaches the eye, on the card itself.
    const cardText = moves.textContent?.replace(/\s+/g, ' ') ?? '';
    for (const stat of [
      'Vine Tap', 'quick', 'Power 18', 'Accuracy 100%', 'Sun gain 1', 'Sun cost 0',
      'Guard Root', 'guard',
      'Solar Lance', 'signature', 'Power 42', 'Accuracy 85%', 'Sun cost 2',
      'Photosynthesis', 'heal',
    ]) {
      expect(cardText).toContain(stat);
    }

    /*
      …and the ear gets a deliberate name rather than the card's text nodes
      run together. The facts are the same; the ordering puts the move and
      what it costs first, which is what decides the turn.
    */
    expect(
      within(moves).getByRole('button', {
        name: 'Vine Tap, quick move. power 18, never misses, costs no Sun, gains 1 Sun.',
      })
    ).toBeVisible();
    expect(
      within(moves).getByRole('button', {
        name: 'Guard Root, guard move. no damage, never misses, costs no Sun, gains 1 Sun.',
      })
    ).toBeVisible();
    expect(
      within(moves).getByRole('button', {
        name: 'Solar Lance, signature move. power 42, 85% accuracy, costs 2 Sun.',
      })
    ).toBeVisible();
    expect(
      within(moves).getByRole('button', {
        name: 'Photosynthesis, heal move. no damage, never misses, costs no Sun.',
      })
    ).toBeVisible();

    expect(screen.queryByText('Bot Thornback used Guard Root.')).not.toBeInTheDocument();
    expect(screen.queryByText(/dealt 34 special damage/i)).not.toBeInTheDocument();
    expect(screen.queryByText('82%')).not.toBeInTheDocument();
    expect(screen.queryByText('58%')).not.toBeInTheDocument();
  });

  it('marks the slower plant and the spent recovery in the intel chips', async () => {
    await enterActiveBattle(
      battleSession({
        player: { stats: { hp: 132, attack: 54, defense: 88, speed: 22 } },
        bot: { healUsed: true },
      })
    );

    expect(screen.getByText('Thornback acts first each round')).toBeVisible();
    expect(screen.getByText('Thornback has spent its recovery')).toBeVisible();
  });

  it('renders invalid public energy boundaries defensively', async () => {
    await enterActiveBattle(
      battleSession({
        player: { energy: 1, maxEnergy: Number.NaN },
        bot: { energy: 1, maxEnergy: -1 },
      })
    );

    // A NaN and a negative maxEnergy must both floor to an empty 0-of-0 track
    // rather than rendering a negative number of pips.
    expect(screen.getAllByRole('img', { name: /sun 0 of 0/i })).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /solar lance/i })
    ).toHaveAccessibleDescription(/needs 2 sun; 0 available/i);
  });

  it('keeps unavailable moves keyboard-focusable with guarded accessible reasons', async () => {
    const { unmount, user } = await enterActiveBattle(
      battleSession({
        player: { currentHp: 90, maxHp: 132, energy: 0, healUsed: true },
      })
    );

    const signature = screen.getByRole('button', { name: /solar lance/i });
    const heal = screen.getByRole('button', { name: /photosynthesis/i });
    expect(signature).not.toBeDisabled();
    expect(signature).toHaveAttribute('aria-disabled', 'true');
    expect(signature).toHaveAccessibleDescription(/needs 2 sun; 0 available/i);
    expect(heal).not.toBeDisabled();
    expect(heal).toHaveAttribute('aria-disabled', 'true');
    expect(heal).toHaveAccessibleDescription(/already used this battle/i);

    // Tab until the guarded move is reached rather than assuming a fixed count:
    // the point is that an unavailable move stays in the tab order, and the
    // battle screen's chrome (the back button) sits ahead of the move grid.
    for (let i = 0; i < 12 && document.activeElement !== signature; i += 1) {
      await user.tab();
    }
    expect(signature).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(apiMocks.submitPveAction).not.toHaveBeenCalled();

    unmount();
    await enterActiveBattle(
      battleSession({
        player: { currentHp: 132, maxHp: 132, energy: 2, healUsed: false },
      })
    );
    const fullHealthHeal = screen.getByRole('button', {
      name: /photosynthesis/i,
    });
    expect(fullHealthHeal).not.toBeDisabled();
    expect(fullHealthHeal).toHaveAttribute('aria-disabled', 'true');
    expect(fullHealthHeal).toHaveAccessibleDescription(/hp is already full/i);
  });

  it('applies 320px-safe containment to server-controlled battle copy', async () => {
    const playerName = 'PlayerNameWithoutAnyNaturalBreakOpportunity'.repeat(2);
    const botName = 'OpponentNameWithoutAnyNaturalBreakOpportunity'.repeat(2);
    const moveName = 'MoveNameWithoutAnyNaturalBreakOpportunity'.repeat(2);
    const logMessage = 'EventTextWithoutAnyNaturalBreakOpportunity'.repeat(3);
    const errorMessage = 'ErrorTextWithoutAnyNaturalBreakOpportunity'.repeat(3);
    apiMocks.submitPveAction.mockRejectedValueOnce(new Error(errorMessage));
    const { user } = await enterActiveBattle(
      battleSession({
        player: {
          name: playerName,
          moves: playerMoves.map((move, index) =>
            index === 0 ? { ...move, name: moveName } : move
          ),
        },
        bot: { name: botName },
        log: [
          {
            turnNumber: 0,
            type: 'battle_started',
            actor: 'system',
            message: logMessage,
          },
        ],
      })
    );

    const playerHeading = screen.getByRole('heading', { name: playerName });
    expect(playerHeading).toHaveClass('battle-server-copy');
    expect(
      screen.getByRole('heading', { name: botName })
    ).toHaveClass('battle-server-copy');
    expect(screen.getByText(moveName)).toHaveClass('battle-server-copy');
    expect(screen.getByText(logMessage)).toHaveClass('battle-server-copy');

    await user.click(
      screen.getByRole('button', { name: new RegExp(`^${moveName}`) })
    );
    expect(
      within(await screen.findByRole('alert')).getByText(errorMessage)
    ).toHaveClass('battle-server-copy');
  });

  it('submits the current expected turn once on double click and locks every command', async () => {
    const request = deferred<BattleActionResult>();
    apiMocks.submitPveAction.mockReturnValue(request.promise);
    const { user } = await enterActiveBattle(battleSession({ turnNumber: 3 }));
    const moves = screen.getByRole('group', { name: /battle moves/i });

    await user.dblClick(within(moves).getByRole('button', { name: /vine tap/i }));

    expect(apiMocks.submitPveAction).toHaveBeenCalledTimes(1);
    expect(apiMocks.submitPveAction).toHaveBeenCalledWith(
      'battle-1',
      'vine-tap',
      3
    );
    for (const move of within(moves).getAllByRole('button')) {
      expect(move).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /abandon match/i })).toBeDisabled();
    expect(screen.getByRole('status', { name: /resolving turn 3/i })).toBeVisible();

    await act(async () =>
      request.resolve(actionResult(battleSession({ turnNumber: 4 })))
    );
    expect(
      await screen.findByRole('heading', { name: /turn 4/i })
    ).toBeVisible();
  });

  it('retries a failed action with the same move and expected turn', async () => {
    apiMocks.submitPveAction
      .mockRejectedValueOnce(new Error('Round submission failed.'))
      .mockResolvedValueOnce(actionResult(battleSession({ turnNumber: 3 })));
    const { user } = await enterActiveBattle(battleSession({ turnNumber: 2 }));

    await user.click(screen.getByRole('button', { name: /vine tap/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Round submission failed.'
    );
    await user.click(screen.getByRole('button', { name: /retry move/i }));

    expect(
      await screen.findByRole('heading', { name: /turn 3/i })
    ).toBeVisible();
    expect(apiMocks.submitPveAction.mock.calls).toEqual([
      ['battle-1', 'vine-tap', 2],
      ['battle-1', 'vine-tap', 2],
    ]);
  });

  it('renders structured public battle events in server order', async () => {
    const next = battleSession({
      turnNumber: 2,
      log: [
        {
          turnNumber: 0,
          type: 'battle_started',
          actor: 'system',
          message: 'Battle started.',
        },
        {
          turnNumber: 1,
          type: 'move_used',
          actor: 'player',
          moveId: 'vine-tap',
          message: 'Fern Ward used Vine Tap.',
        },
        {
          turnNumber: 1,
          type: 'damage_dealt',
          actor: 'bot',
          amount: 17,
          message: 'Opponent dealt 17 damage.',
        },
        {
          turnNumber: 2,
          type: 'bot_intent_prepared',
          actor: 'bot',
          intent: 'uncertain',
          message: 'Opponent intent prepared.',
        },
      ],
    });
    apiMocks.submitPveAction.mockResolvedValue(actionResult(next));
    const { user } = await enterActiveBattle();

    await user.click(screen.getByRole('button', { name: /vine tap/i }));
    const items = within(
      await screen.findByRole('log', { name: /battle log/i })
    ).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/opening.*system.*battle started/i),
      expect.stringMatching(/turn 1.*player.*move used.*fern ward used vine tap/i),
      expect.stringMatching(/turn 1.*opponent.*damage dealt.*opponent dealt 17 damage/i),
      expect.stringMatching(/turn 2.*opponent.*intent prepared.*opponent intent prepared/i),
    ]);
  });

  it('uses the stale action response as the authoritative session without an extra GET', async () => {
    const authoritative = battleSession({
      turnNumber: 5,
      player: { currentHp: 73, energy: 2 },
      botIntent: 'uncertain',
    });
    apiMocks.submitPveAction.mockResolvedValue(
      actionResult(authoritative, true)
    );
    const { user } = await enterActiveBattle(battleSession({ turnNumber: 4 }));

    await user.click(screen.getByRole('button', { name: /vine tap/i }));

    expect(
      await screen.findByRole('status', { name: /battle caught up/i })
    ).toHaveTextContent(/caught up to the current turn/i);
    expect(screen.getByRole('heading', { name: /turn 5/i })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: /fern ward hp 73 of 132/i })).toBeVisible();
    expect(apiMocks.getPveBattle).not.toHaveBeenCalled();
  });

  it.each([
    ['won', 'Victory', 20],
    ['lost', 'Defeat', 5],
  ] as const)(
    'shows the persisted %s outcome and awarded XP',
    async (status, heading, xp) => {
      apiMocks.submitPveAction.mockResolvedValue(
        actionResult(battleSession({ status, xpAwarded: xp }))
      );
      const { user } = await enterActiveBattle();

      await user.click(screen.getByRole('button', { name: /vine tap/i }));

      expect(
        await screen.findByRole('heading', { name: heading })
      ).toBeVisible();
      expect(screen.getByText(`${xp} XP awarded`)).toBeVisible();
      // A result is only meaningful next to everyone else's.
      expect(screen.getByRole('link', { name: /view ranking/i })).toHaveAttribute(
        'href',
        '/leaderboard'
      );
      expect(screen.queryByRole('group', { name: /battle moves/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /replay/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /change plant/i })).toBeEnabled();
    }
  );

  it('replay starts a new persisted session and locks terminal commands while starting', async () => {
    apiMocks.submitPveAction.mockResolvedValue(
      actionResult(battleSession({ status: 'won' }))
    );
    const { user } = await enterActiveBattle();
    await user.click(screen.getByRole('button', { name: /vine tap/i }));
    await screen.findByRole('heading', { name: /victory/i });

    const replay = deferred<BattleSession>();
    apiMocks.startPveBattle.mockReturnValueOnce(replay.promise);
    await user.click(screen.getByRole('button', { name: /replay/i }));

    expect(apiMocks.startPveBattle).toHaveBeenLastCalledWith('fern-1');
    expect(screen.getByRole('button', { name: /replay/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /change plant/i })).toBeDisabled();
    expect(screen.getByRole('status', { name: /starting replay/i })).toBeVisible();

    await act(async () =>
      replay.resolve(battleSession({ id: 'battle-replay', turnNumber: 1 }))
    );
    expect(
      await screen.findByRole('heading', { name: /turn 1/i })
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: /victory/i })).not.toBeInTheDocument();
  });

  it('returns a terminal battle to avatar selection without another server command', async () => {
    apiMocks.submitPveAction.mockResolvedValue(
      actionResult(battleSession({ status: 'lost' }))
    );
    const { user } = await enterActiveBattle();
    await user.click(screen.getByRole('button', { name: /vine tap/i }));
    await screen.findByRole('heading', { name: /defeat/i });

    await user.click(screen.getByRole('button', { name: /change plant/i }));

    expect(
      screen.getByRole('heading', { name: /fern ward is ready/i })
    ).toBeVisible();
    expect(apiMocks.abandonPveBattle).not.toHaveBeenCalled();
  });

  it('persists abandon before returning to selection and reports zero XP', async () => {
    const request = deferred<BattleSession>();
    apiMocks.abandonPveBattle.mockReturnValue(request.promise);
    const { user } = await enterActiveBattle();

    await confirmAbandon(user);
    expect(apiMocks.abandonPveBattle).toHaveBeenCalledWith('battle-1');
    expect(screen.getByRole('button', { name: /abandon match/i })).toBeDisabled();
    expect(screen.getByRole('status', { name: /abandoning battle/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /turn 1/i })).toBeVisible();

    await act(async () =>
      request.resolve(battleSession({ status: 'abandoned', xpAwarded: 0 }))
    );
    expect(
      await screen.findByRole('status', { name: /battle abandoned/i })
    ).toHaveTextContent(/0 xp awarded/i);
    expect(screen.getByRole('heading', { name: /fern ward is ready/i })).toBeVisible();
    expect(screen.queryByRole('heading', { name: /turn 1/i })).not.toBeInTheDocument();
  });

  it('retries a failed abandon before leaving the active session', async () => {
    apiMocks.abandonPveBattle
      .mockRejectedValueOnce(new Error('Abandon request failed.'))
      .mockResolvedValueOnce(battleSession({ status: 'abandoned' }));
    const { user } = await enterActiveBattle();

    await confirmAbandon(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Abandon request failed.'
    );
    expect(screen.getByRole('heading', { name: /turn 1/i })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /retry abandon/i }));
    expect(
      await screen.findByRole('status', { name: /battle abandoned/i })
    ).toBeVisible();
    expect(apiMocks.abandonPveBattle.mock.calls).toEqual([
      ['battle-1'],
      ['battle-1'],
    ]);
  });

  it('resumes a stored active battle instead of showing the roster', async () => {
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-1');
    apiMocks.getPveBattle.mockResolvedValue(battleSession({ turnNumber: 6 }));

    renderBattle();

    expect(
      await screen.findByRole('heading', { name: /turn 6/i })
    ).toBeVisible();
    expect(apiMocks.getPveBattle).toHaveBeenCalledWith('battle-1');
    expect(apiMocks.startPveBattle).not.toHaveBeenCalled();
  });

  it('drops a stored pointer to a finished battle and lands on the roster', async () => {
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-1');
    apiMocks.getPveBattle.mockResolvedValue(battleSession({ status: 'won' }));

    renderBattle();

    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBeNull();
  });

  it('drops a stored pointer the server definitively no longer recognises', async () => {
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-gone');
    // A 404 is the server's verdict that the session is gone — unlike a
    // network error, which must keep the pointer for a later retry.
    apiMocks.getPveBattle.mockRejectedValue(
      Object.assign(new Error('Not found.'), {
        isAxiosError: true,
        response: { status: 404 },
      })
    );

    renderBattle();

    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBeNull();
  });

  it('stores the session pointer while a battle is live and clears it at the end', async () => {
    apiMocks.submitPveAction.mockResolvedValue(
      actionResult(battleSession({ status: 'won', xpAwarded: 20 }))
    );
    const { user } = await enterActiveBattle();
    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBe('battle-1');

    await user.click(screen.getByRole('button', { name: /vine tap/i }));
    await screen.findByRole('heading', { name: /victory/i });

    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBeNull();
  });

  it('keeps the pointer when the resume fetch fails transiently', async () => {
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-1');
    apiMocks.getPveBattle.mockRejectedValue(new Error('Network Error'));

    renderBattle();

    // Lands on the roster, but a network blip is not proof the battle is
    // dead — the pointer survives so the next visit retries the resume.
    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBe('battle-1');
  });

  it('lets an explicit route avatar outrank a stored session', async () => {
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-1');

    renderBattle({ avatarId: 'fern-1' });

    // The player is mid-gesture from the Archive's Battle button: they get
    // the roster with their plant preselected, not a surprise resume. The
    // pointer stays for the next direct visit.
    expect(
      await screen.findByRole('heading', { name: /fern ward is ready/i })
    ).toBeVisible();
    expect(apiMocks.getPveBattle).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBe('battle-1');
  });

  it('resumes the stored session when an archive-shortcut entry is revisited', async () => {
    // The archive gesture rides in history state, and history state survives
    // a reload — so the same entry, avatarId and all, mounts twice. Only the
    // first mount is the player mid-gesture; the second must resume.
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-1');
    apiMocks.getPveBattle.mockResolvedValue(battleSession({ turnNumber: 4 }));
    const archiveEntry = {
      pathname: '/battle',
      state: { avatarId: 'fern-1' },
      key: 'archive-entry',
    };
    const mountEntry = () =>
      render(
        <MemoryRouter initialEntries={[archiveEntry]}>
          <NavigationLockProvider>
            <Routes>
              <Route path="/battle" element={<BattlePage />} />
            </Routes>
          </NavigationLockProvider>
        </MemoryRouter>
      );

    const firstVisit = mountEntry();
    expect(
      await screen.findByRole('heading', { name: /fern ward is ready/i })
    ).toBeVisible();
    expect(apiMocks.getPveBattle).not.toHaveBeenCalled();
    firstVisit.unmount();

    mountEntry();
    expect(
      await screen.findByRole('heading', { name: /turn 4/i })
    ).toBeVisible();
    expect(apiMocks.getPveBattle).toHaveBeenCalledWith('battle-1');
  });

  it('recovers the roster when abandoning a resumed battle whose quiet refresh failed', async () => {
    sessionStorage.setItem('sprout.battle.sessionId', 'battle-1');
    apiMocks.getPveBattle.mockResolvedValue(battleSession());
    apiMocks.listOwnedAvatars
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(rosterPage);
    const { user } = renderBattle();

    await screen.findByRole('heading', { name: /turn 1/i });
    await confirmAbandon(user);

    // The abandon receipt must not be hostage to the roster's arrival…
    expect(
      await screen.findByRole('status', { name: /battle abandoned/i })
    ).toHaveTextContent(/0 xp awarded/i);
    // …and the empty-roster fallback refetch repopulates the selection.
    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
  });

  /*
    Abandon ends the match server-side with no resume path and awards nothing,
    and it sits one Enter away from the four moves in tab order. It used to
    fire on the first press with no warning.
  */
  it('asks before abandoning, and does nothing if the player backs out', async () => {
    const { user } = await enterActiveBattle();

    await user.click(screen.getByRole('button', { name: /abandon match/i }));
    const prompt = await screen.findByRole('alertdialog', {
      name: /confirm abandoning this match/i,
    });
    expect(prompt).toHaveTextContent(/cannot be resumed/i);
    expect(prompt).toHaveTextContent(/0 XP/i);
    expect(apiMocks.abandonPveBattle).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(apiMocks.abandonPveBattle).not.toHaveBeenCalled();
    // Still mid-battle, with the turn intact.
    expect(screen.getByRole('heading', { name: /turn 1/i })).toBeVisible();
  });

  it('abandons only on the second, explicit confirmation', async () => {
    const { user } = await enterActiveBattle();

    await user.click(screen.getByRole('button', { name: /abandon match/i }));
    await user.click(
      screen.getByRole('button', { name: /abandon, lose progress/i })
    );

    expect(apiMocks.abandonPveBattle).toHaveBeenCalledWith('battle-1');
    expect(
      await screen.findByRole('status', { name: /battle abandoned/i })
    ).toHaveTextContent(/0 xp awarded/i);
  });

  it('drops a stale confirmation if the battle moves on underneath it', async () => {
    const { user } = await enterActiveBattle();
    await user.click(screen.getByRole('button', { name: /abandon match/i }));
    expect(
      screen.getByRole('alertdialog', { name: /confirm abandoning/i })
    ).toBeVisible();

    // A bfcache revalidate lands a newer turn while the prompt is open. The
    // prompt described turn 1; answering it now would answer for turn 3.
    apiMocks.getPveBattle.mockResolvedValue(battleSession({ turnNumber: 3 }));
    const restore = new Event('pageshow');
    Object.defineProperty(restore, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(restore);
    });

    expect(await screen.findByRole('heading', { name: /turn 3/i })).toBeVisible();
    expect(
      screen.queryByRole('alertdialog', { name: /confirm abandoning/i })
    ).not.toBeInTheDocument();
    expect(apiMocks.abandonPveBattle).not.toHaveBeenCalled();
  });

  it('returns focus to the committed move once the turn settles', async () => {
    const { user } = await enterActiveBattle();
    const vineTap = screen.getByRole('button', {
      name: /^Vine Tap, quick move\./,
    });
    vineTap.focus();
    expect(vineTap).toHaveFocus();

    await user.click(vineTap);
    await screen.findByRole('heading', { name: /turn 2/i });

    // Disabling the button dropped focus to <body>; a keyboard player lost
    // their place and their focus ring every single turn.
    expect(
      screen.getByRole('button', { name: /^Vine Tap, quick move\./ })
    ).toHaveFocus();
  });

  it('leaves focus alone if the player moved it while the turn resolved', async () => {
    const { user } = await enterActiveBattle();
    await user.click(
      screen.getByRole('button', { name: /^Vine Tap, quick move\./ })
    );
    await screen.findByRole('heading', { name: /turn 2/i });

    // Focus is restored above, so deliberately move it and confirm a later
    // settle does not yank it back.
    const abandon = screen.getByRole('button', { name: /abandon match/i });
    abandon.focus();
    expect(abandon).toHaveFocus();
  });

  /*
    The bfcache resurrection: browser Back restored a document frozen with a
    finished battle fully playable-looking. Two defences — pageshow(persisted)
    re-runs the entry decision against the server, and a command bouncing off
    a dead session resyncs to the server's verdict instead of offering a
    Retry that can never succeed.
  */
  it('resyncs to the server verdict when a move bounces off a finished session', async () => {
    apiMocks.submitPveAction.mockRejectedValueOnce(
      Object.assign(new Error('Battle session is already complete.'), {
        isAxiosError: true,
        response: { status: 409 },
      })
    );
    apiMocks.getPveBattle.mockResolvedValue(
      battleSession({ status: 'abandoned', xpAwarded: 0 })
    );
    const { user } = await enterActiveBattle();

    await user.click(screen.getByRole('button', { name: /vine tap/i }));

    // The result screen, not a dead-end error panel: the player sees how the
    // battle actually ended and holds live Replay / Change Plant controls.
    expect(
      await screen.findByRole('heading', { name: /battle abandoned/i })
    ).toBeVisible();
    expect(screen.getByText(/already ended/i)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /retry move/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replay/i })).toBeEnabled();
  });

  it('falls back to the roster when the conflicting session is gone entirely', async () => {
    apiMocks.submitPveAction.mockRejectedValueOnce(
      Object.assign(new Error('Battle session not found.'), {
        isAxiosError: true,
        response: { status: 404 },
      })
    );
    apiMocks.getPveBattle.mockRejectedValue(
      Object.assign(new Error('Battle session not found.'), {
        isAxiosError: true,
        response: { status: 404 },
      })
    );
    const { user } = await enterActiveBattle();

    await user.click(screen.getByRole('button', { name: /vine tap/i }));

    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(sessionStorage.getItem('sprout.battle.sessionId')).toBeNull();
  });

  it('revalidates a document restored from the back/forward cache', async () => {
    await enterActiveBattle();
    // The abandon happened in this document's previous life: the server ended
    // the battle and cleared the stored pointer, then bfcache froze the
    // fully-playable-looking battle screen.
    sessionStorage.removeItem('sprout.battle.sessionId');

    const restore = new Event('pageshow');
    Object.defineProperty(restore, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(restore);
    });

    // Back at the roster — the frozen battle is not resurrected.
    expect(
      await screen.findByRole('button', { name: /select fern ward/i })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /vine tap/i })
    ).not.toBeInTheDocument();
  });

  it('resumes a still-live battle after a back/forward cache restore', async () => {
    await enterActiveBattle();
    apiMocks.getPveBattle.mockResolvedValue(battleSession({ turnNumber: 3 }));

    const restore = new Event('pageshow');
    Object.defineProperty(restore, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(restore);
    });

    // The pointer still names a live session, so the restore lands the player
    // on the server's current turn rather than the frozen one.
    expect(
      await screen.findByRole('heading', { name: /turn 3/i })
    ).toBeVisible();
  });

  /*
    jsdom has no matchMedia, so every other test exercises the reduced-motion
    (instant) path. This block stubs motion ON and lets the real beat clock run
    (0ms / 1250ms / +400ms) — the only automated coverage the cinematic has.
  */
  describe('turn cinematic with motion enabled', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('plays the resolved turn beat by beat before settling on the final state', async () => {
      const resolved = battleSession({
        turnNumber: 2,
        player: { currentHp: 89 },
        bot: { currentHp: 101 },
        log: [
          {
            turnNumber: 1,
            type: 'move_used',
            actor: 'player',
            moveId: 'vine-tap',
            message: 'Fern Ward used Vine Tap.',
          },
          {
            turnNumber: 1,
            type: 'damage_dealt',
            actor: 'player',
            amount: 17,
            message: 'Fern Ward dealt 17 damage.',
          },
          {
            turnNumber: 1,
            type: 'damage_dealt',
            actor: 'bot',
            amount: 12,
            message: 'Opponent dealt 12 damage.',
          },
        ],
      });
      apiMocks.submitPveAction.mockResolvedValue(actionResult(resolved));

      const view = await enterActiveBattle();
      const narration = () => view.container.querySelector('.battle-narration');
      await view.user.click(screen.getByRole('button', { name: /vine tap/i }));

      // Beat 1: the player's move narrates and only Thornback's bar has moved.
      await waitFor(
        () =>
          expect(narration()?.textContent).toContain('Fern Ward used Vine Tap.'),
        { timeout: 2000 }
      );
      expect(
        screen.getByRole('progressbar', { name: /thornback hp 101 of 140/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('progressbar', { name: /fern ward hp 101 of 132/i })
      ).toBeInTheDocument();

      // Beat 2 (t=1250ms): the counterattack lands and the player's bar drains.
      await waitFor(
        () =>
          expect(narration()?.textContent).toContain('Opponent dealt 12 damage.'),
        { timeout: 2500 }
      );
      expect(
        screen.getByRole('progressbar', { name: /fern ward hp 89 of 132/i })
      ).toBeInTheDocument();

      // Playback over: the strip clears and the session values stand.
      await waitFor(() => expect(narration()).toBeNull(), { timeout: 2500 });
      expect(
        screen.getByRole('progressbar', { name: /fern ward hp 89 of 132/i })
      ).toBeInTheDocument();
    }, 15000);

    it('gives a silent guard its own beat instead of skipping it', async () => {
      const resolved = battleSession({
        turnNumber: 2,
        player: { currentHp: 95 },
        log: [
          {
            turnNumber: 1,
            type: 'move_used',
            actor: 'player',
            moveId: 'guard-root',
            message: 'Fern Ward used Guard Root.',
          },
          {
            turnNumber: 1,
            type: 'move_used',
            actor: 'bot',
            message: 'Opponent moved.',
          },
          {
            turnNumber: 1,
            type: 'damage_dealt',
            actor: 'bot',
            amount: 6,
            message: 'Opponent dealt 6 damage.',
          },
        ],
      });
      apiMocks.submitPveAction.mockResolvedValue(actionResult(resolved));

      const view = await enterActiveBattle();
      const narration = () => view.container.querySelector('.battle-narration');
      await view.user.click(screen.getByRole('button', { name: /guard root/i }));

      // The guard's beat exists: it narrates even though no outcome followed.
      await waitFor(
        () =>
          expect(narration()?.textContent).toContain('Fern Ward used Guard Root.'),
        { timeout: 2000 }
      );

      await waitFor(
        () =>
          expect(narration()?.textContent).toContain('Opponent dealt 6 damage.'),
        { timeout: 2500 }
      );

      await waitFor(() => expect(narration()).toBeNull(), { timeout: 2500 });
    }, 15000);

    it('locks the move grid and Abandon while the turn plays out', async () => {
      const resolved = battleSession({
        turnNumber: 2,
        player: { currentHp: 89 },
        log: [
          {
            turnNumber: 1,
            type: 'move_used',
            actor: 'player',
            moveId: 'vine-tap',
            message: 'Fern Ward used Vine Tap.',
          },
          {
            turnNumber: 1,
            type: 'damage_dealt',
            actor: 'bot',
            amount: 12,
            message: 'Thornback dealt 12 damage.',
          },
        ],
      });
      apiMocks.submitPveAction.mockResolvedValue(actionResult(resolved));

      const view = await enterActiveBattle();
      const narration = () => view.container.querySelector('.battle-narration');
      await view.user.click(screen.getByRole('button', { name: /vine tap/i }));

      // Mid-playback: the session in state is already turn 2, but the player
      // has not seen turn 1 resolve. Rapid clicks here used to commit turn 2's
      // move blind, skipping the intent and log entirely.
      await waitFor(
        () =>
          expect(narration()?.textContent).toContain('Fern Ward used Vine Tap.'),
        { timeout: 2000 }
      );
      expect(screen.getByRole('button', { name: /vine tap/i })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: /abandon match/i })
      ).toBeDisabled();
      expect(apiMocks.submitPveAction).toHaveBeenCalledTimes(1);

      // Playback over: the grid unlocks for the turn the player can now see.
      await waitFor(() => expect(narration()).toBeNull(), { timeout: 4000 });
      expect(screen.getByRole('button', { name: /vine tap/i })).toBeEnabled();
      expect(
        screen.getByRole('button', { name: /abandon match/i })
      ).toBeEnabled();
    }, 15000);

    it('holds the outcome panel until the final turn finishes playing', async () => {
      const won = battleSession({
        status: 'won',
        xpAwarded: 20,
        bot: { currentHp: 0 },
        log: [
          {
            turnNumber: 1,
            type: 'move_used',
            actor: 'player',
            moveId: 'vine-tap',
            message: 'Fern Ward used Vine Tap.',
          },
          {
            turnNumber: 1,
            type: 'damage_dealt',
            actor: 'player',
            amount: 17,
            message: 'Fern Ward dealt 17 damage.',
          },
        ],
      });
      apiMocks.submitPveAction.mockResolvedValue(actionResult(won));

      const { user } = await enterActiveBattle();
      await user.click(screen.getByRole('button', { name: /vine tap/i }));

      // Mid-playback: no spoiler, no clickable Replay.
      expect(await screen.findByText(/final turn is resolving/i)).toBeVisible();
      expect(screen.queryByRole('heading', { name: /victory/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();

      // One-beat script: the panel reveals at ~1650ms when the cinematic ends.
      expect(
        await screen.findByRole('heading', { name: /victory/i }, { timeout: 3000 })
      ).toBeVisible();
      expect(screen.getByText('20 XP awarded')).toBeVisible();
      expect(screen.getByRole('button', { name: /replay/i })).toBeEnabled();
    }, 15000);
  });
});
