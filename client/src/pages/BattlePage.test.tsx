import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvatarRecord,
  BattleActionResult,
  BattleMove,
  BattleSession,
  PaginatedAvatars,
} from '../services/sproutApi';
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
    healUsed: false,
    moves: playerMoves,
    ...options.player,
  };
  const bot = {
    id: 'thornback-v1',
    name: 'Thornback',
    spriteUrl: '/battle/thornback.png',
    stats: { hp: 140, attack: 66, defense: 72, speed: 43 },
    currentHp: 118,
    maxHp: 140,
    energy: 0,
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
      <Routes>
        <Route path="/battle" element={<BattlePage />} />
        <Route path="/archive" element={<p>Owned archive destination</p>} />
      </Routes>
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

describe('BattlePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
        <Routes>
          <Route path="/battle" element={<RouteStateHarness />} />
        </Routes>
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

  it('renders bounded server HP, Sun, broad intent, and every public move field', async () => {
    await enterActiveBattle(
      battleSession({
        turnNumber: 7,
        botIntent: 'committed',
        player: { currentHp: 155, maxHp: 132, energy: 9 },
        bot: { currentHp: -4, maxHp: 140, energy: -2 },
      })
    );

    expect(screen.getByRole('progressbar', { name: /fern ward hp 132 of 132/i })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: /thornback hp 0 of 140/i })).toBeVisible();
    expect(screen.getByText('Sun 2 / 2')).toBeVisible();
    expect(screen.getByText('Sun 0 / 2')).toBeVisible();
    expect(screen.getByText(/committed to a decisive action/i)).toBeVisible();

    const moves = screen.getByRole('group', { name: /battle moves/i });
    expect(within(moves).getByRole('button', { name: /vine tap.*quick.*power 18.*accuracy 100%.*sun gain 1.*sun cost 0/i })).toBeVisible();
    expect(within(moves).getByRole('button', { name: /guard root.*guard.*power 0.*accuracy 100%.*sun gain 1.*sun cost 0/i })).toBeVisible();
    expect(within(moves).getByRole('button', { name: /solar lance.*signature.*power 42.*accuracy 85%.*sun gain 0.*sun cost 2/i })).toBeVisible();
    expect(within(moves).getByRole('button', { name: /photosynthesis.*heal.*power 0.*accuracy 100%.*sun gain 0.*sun cost 0/i })).toBeVisible();

    expect(screen.queryByText('Bot Thornback used Guard Root.')).not.toBeInTheDocument();
    expect(screen.queryByText(/dealt 34 special damage/i)).not.toBeInTheDocument();
    expect(screen.queryByText('82%')).not.toBeInTheDocument();
    expect(screen.queryByText('58%')).not.toBeInTheDocument();
  });

  it('exposes why unaffordable, consumed, and full-health moves are disabled', async () => {
    const { unmount } = await enterActiveBattle(
      battleSession({
        player: { currentHp: 90, maxHp: 132, energy: 0, healUsed: true },
      })
    );

    const signature = screen.getByRole('button', { name: /solar lance/i });
    const heal = screen.getByRole('button', { name: /photosynthesis/i });
    expect(signature).toBeDisabled();
    expect(signature).toHaveAccessibleDescription(/needs 2 sun; 0 available/i);
    expect(heal).toBeDisabled();
    expect(heal).toHaveAccessibleDescription(/already used this battle/i);

    unmount();
    await enterActiveBattle(
      battleSession({
        player: { currentHp: 132, maxHp: 132, energy: 2, healUsed: false },
      })
    );
    expect(screen.getByRole('button', { name: /photosynthesis/i })).toHaveAccessibleDescription(
      /hp is already full/i
    );
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
      await screen.findByRole('status', { name: /battle synchronized/i })
    ).toHaveTextContent(/latest server turn/i);
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
      expect(screen.getByText(`XP awarded: ${xp}`)).toBeVisible();
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

    await user.click(screen.getByRole('button', { name: /abandon match/i }));
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

    await user.click(screen.getByRole('button', { name: /abandon match/i }));
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
});
