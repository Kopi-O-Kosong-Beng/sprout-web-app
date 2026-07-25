import {
  abandonBattle,
  calculateDamage,
  calculateProgression,
  createBattle,
  prepareBotIntent,
  resolvePlayerAction,
} from '../services/battle-engine';
import { nextRandom } from '../services/seeded-rng';
import type {
  AvatarBattleInput,
  BattleIntent,
  BattleMove,
  BattleSession,
} from '../models/battle';

const NOW = '2026-07-22T08:00:00.000Z';
const ACTIVE_ROUND_AT = '2026-07-22T08:01:00.000Z';
const WIN_AT = '2026-07-22T08:02:00.000Z';
const LOSS_AT = '2026-07-22T08:03:00.000Z';
const ABANDONED_AT = '2026-07-22T08:04:00.000Z';
const ACTIVE_TRANSITION = { transitionAt: ACTIVE_ROUND_AT };

const basePlayer: AvatarBattleInput = {
  id: 'avatar-1',
  name: 'Sunny',
  speciesName: 'Helianthus annuus',
  speciesFamily: 'Asteraceae',
  spriteUrl: '/static/sprites/helianthus-annuus.png',
  stats: { hp: 100, attack: 60, defense: 40, speed: 70 },
};

function makeSession(
  input: Partial<AvatarBattleInput> = {},
  rngSeed = 12345
): BattleSession {
  return createBattle({
    id: 'battle-1',
    userId: 'user-1',
    avatarId: 'avatar-1',
    player: {
      ...basePlayer,
      ...input,
      stats: input.stats ?? basePlayer.stats,
    },
    rngSeed,
    now: NOW,
  });
}

function forceBotMove(
  session: BattleSession,
  moveId: BattleMove['id'],
  intent: BattleIntent = 'building'
): BattleSession {
  return {
    ...session,
    pendingBotMoveId: moveId,
    botIntent: intent,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

describe('seeded RNG', () => {
  it('uses the unsigned 32-bit LCG sequence', () => {
    const first = nextRandom(0);
    const second = nextRandom(first.state);

    expect(first).toEqual({
      state: 1013904223,
      value: 1013904223 / 0x1_0000_0000,
    });
    expect(second).toEqual({
      state: 1196435762,
      value: 1196435762 / 0x1_0000_0000,
    });
  });

  it('normalizes signed and oversized seeds to the same uint32 stream', () => {
    expect(nextRandom(-1)).toEqual(nextRandom(0xffff_ffff));
    expect(nextRandom(0x1_0000_0001)).toEqual(nextRandom(1));
  });
});

describe('battle creation and catalogue', () => {
  it('creates a versioned session against fixed Thornback with all four actions', () => {
    const session = makeSession();

    expect(session).toMatchObject({
      status: 'active',
      phase: 'PLAYER_ACTION',
      turnNumber: 1,
      moveCatalogVersion: 'v1',
      npcPresetVersion: 'thornback-v1',
      rngSeed: 12345,
      rngStep: 1,
      rewardApplied: false,
      xpAwarded: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
    });
    expect(session.bot.name).toBe('Thornback');
    expect(session.player.name).toBe('Sunny');
    expect(session.player.moves.map((move) => move.id)).toEqual([
      'quick',
      'guard',
      'signature',
      'photosynthesis',
    ]);
    expect(session.bot.moves.map((move) => move.id)).toEqual([
      'quick',
      'guard',
      'signature',
      'photosynthesis',
    ]);
    expect(session.pendingBotMoveId).not.toBeNull();
    expect(session.botIntent).not.toBeNull();
    expect(session.player.moves.find((move) => move.id === 'quick')).toMatchObject({
      accuracy: 100,
      energyGain: 1,
      energyCost: 0,
    });
    expect(session.player.moves.find((move) => move.id === 'signature')).toMatchObject({
      energyCost: 2,
    });
    expect(
      session.player.moves.find((move) => move.id === 'signature')!.accuracy
    ).toBeGreaterThanOrEqual(85);
  });

  it('selects species/family moves deterministically and uses a documented fallback', () => {
    const sunflower = makeSession();
    const sameFamily = makeSession({
      id: 'avatar-2',
      name: 'Daisy',
      speciesName: 'Bellis perennis',
    });
    const fallback = makeSession({
      id: 'avatar-3',
      name: 'Mystery',
      speciesName: 'Unknown specimen',
      speciesFamily: null,
    });

    expect(sunflower.player.moves.find((move) => move.id === 'signature')!.name).toBe(
      'Solar Bloom'
    );
    expect(sameFamily.player.moves.find((move) => move.id === 'signature')!.name).toBe(
      'Petal Tempest'
    );
    expect(fallback.player.moves.find((move) => move.id === 'signature')!.name).toBe(
      'Wild Growth'
    );
  });

  it('prepares the same valid hidden move and readable intent from the same state', () => {
    const waiting = {
      ...makeSession({}, 77),
      phase: 'PREPARE_BOT_INTENT' as const,
      pendingBotMoveId: null,
      botIntent: null,
      rngState: 77,
      rngStep: 0,
      log: [],
    };

    const prepared = prepareBotIntent(waiting);
    const repeatedFromSameSeed = prepareBotIntent(waiting);

    expect(prepared.pendingBotMoveId).toBe(repeatedFromSameSeed.pendingBotMoveId);
    expect(prepared.botIntent).toBe(repeatedFromSameSeed.botIntent);
    expect(prepared.phase).toBe('PLAYER_ACTION');
    expect(prepared.rngStep).toBe(1);
    expect(prepared.log.at(-1)).toMatchObject({
      type: 'bot_intent_prepared',
      actor: 'bot',
    });
    expect(prepared.log.at(-1)!.message).not.toContain(
      prepared.bot.moves.find((move) => move.id === prepared.pendingBotMoveId)!.name
    );
  });

  it.each([
    {
      state: 'initial 0-Sun/full-HP state',
      energy: 0,
      damaged: false,
      healUsed: false,
      expectedLegalMoveIds: ['quick', 'guard'],
      expectedMovesByIntent: { building: ['quick', 'guard'] },
    },
    {
      state: 'full-energy/full-HP state',
      energy: 2,
      damaged: false,
      healUsed: false,
      expectedLegalMoveIds: ['quick', 'guard', 'signature'],
      expectedMovesByIntent: { uncertain: ['quick', 'guard', 'signature'] },
    },
    {
      state: 'damaged/0-Sun state',
      energy: 0,
      damaged: true,
      healUsed: false,
      expectedLegalMoveIds: ['quick', 'guard', 'photosynthesis'],
      expectedMovesByIntent: { uncertain: ['quick', 'guard', 'photosynthesis'] },
    },
    {
      state: 'damaged/full-energy state',
      energy: 2,
      damaged: true,
      healUsed: false,
      expectedLegalMoveIds: ['quick', 'guard', 'signature', 'photosynthesis'],
      expectedMovesByIntent: {
        building: ['quick', 'guard'],
        committed: ['signature', 'photosynthesis'],
      },
    },
    {
      state: 'heal-used/full-energy state',
      energy: 2,
      damaged: true,
      healUsed: true,
      expectedLegalMoveIds: ['quick', 'guard', 'signature'],
      expectedMovesByIntent: { uncertain: ['quick', 'guard', 'signature'] },
    },
  ])(
    'keeps every emitted intent ambiguous in the $state',
    ({ energy, damaged, healUsed, expectedLegalMoveIds, expectedMovesByIntent }) => {
      const movesByIntent = new Map<string, Set<string>>();
      const observedMoveIds = new Set<string>();

      for (let index = 0; index < 512; index += 1) {
        const seed = Math.imul(index, 0x9e37_79b1) >>> 0;
        const base = makeSession({}, seed);
        const bot = {
          ...base.bot,
          currentHp: damaged ? Math.floor(base.bot.maxHp / 2) : base.bot.maxHp,
          energy,
          healUsed,
        };
        const legalMoveIds = bot.moves
          .filter((move) => {
            if (move.kind === 'signature') return bot.energy >= move.energyCost;
            if (move.kind === 'heal') {
              return !bot.healUsed && bot.currentHp < bot.maxHp;
            }
            return true;
          })
          .map((move) => move.id);
        const prepared = prepareBotIntent({
          ...base,
          phase: 'PREPARE_BOT_INTENT',
          pendingBotMoveId: null,
          botIntent: null,
          rngState: seed,
          rngStep: 0,
          log: [],
          bot,
        });
        const intent = prepared.botIntent!;
        const moveId = prepared.pendingBotMoveId!;
        const publicEvent = prepared.log.at(-1)!;
        const serializedEvent = JSON.stringify(publicEvent).toLowerCase();

        expect(legalMoveIds).toEqual(expectedLegalMoveIds);
        observedMoveIds.add(moveId);
        const moves = movesByIntent.get(intent) ?? new Set<string>();
        moves.add(moveId);
        movesByIntent.set(intent, moves);

        expect(publicEvent).not.toHaveProperty('moveId');
        for (const move of prepared.bot.moves) {
          expect(serializedEvent).not.toContain(move.id.toLowerCase());
          expect(serializedEvent).not.toContain(move.name.toLowerCase());
        }
      }

      expect(observedMoveIds).toEqual(new Set(expectedLegalMoveIds));
      expect(new Set(movesByIntent.keys())).toEqual(
        new Set(Object.keys(expectedMovesByIntent))
      );
      for (const [intent, expectedMoveIds] of Object.entries(expectedMovesByIntent)) {
        expect(movesByIntent.get(intent)).toEqual(new Set(expectedMoveIds));
      }
      for (const moves of movesByIntent.values()) {
        expect(moves.size).toBeGreaterThanOrEqual(2);
      }
    }
  );

  it('never prepares an invalid heal or unaffordable signature', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const base = makeSession({}, seed);
      const waiting = {
        ...base,
        phase: 'PREPARE_BOT_INTENT' as const,
        pendingBotMoveId: null,
        botIntent: null,
        rngState: seed,
        rngStep: 0,
        bot: { ...base.bot, energy: 0, currentHp: base.bot.maxHp },
      };

      expect(['quick', 'guard']).toContain(prepareBotIntent(waiting).pendingBotMoveId);
    }
  });

  it('adds heal weight below 40 percent without guaranteeing recovery', () => {
    const chosen = new Set<string | null>();

    for (let index = 0; index < 100; index += 1) {
      const seed = Math.imul(index, 0x9e37_79b1) >>> 0;
      const base = makeSession({}, seed);
      chosen.add(
        prepareBotIntent({
          ...base,
          phase: 'PREPARE_BOT_INTENT',
          pendingBotMoveId: null,
          botIntent: null,
          rngState: seed,
          rngStep: 0,
          bot: {
            ...base.bot,
            currentHp: Math.floor(base.bot.maxHp * 0.3),
          },
        }).pendingBotMoveId
      );
    }

    expect(chosen).toContain('photosynthesis');
    expect([...chosen].some((moveId) => moveId !== 'photosynthesis')).toBe(true);
  });
});

describe('battle mechanics', () => {
  const quickMove: BattleMove = {
    id: 'quick',
    name: 'Leaf Tap',
    kind: 'quick',
    power: 20,
    accuracy: 100,
    energyGain: 1,
    energyCost: 0,
  };

  it('calculates the specified damage and halves it after the minimum', () => {
    const attacker = makeSession().player;
    const defender = makeSession().bot;
    const expectedQuickDamage = Math.max(
      5,
      Math.round(
        quickMove.power * (0.75 + attacker.stats.attack / 200) -
          defender.stats.defense * 0.12
      )
    );

    expect(calculateDamage(attacker, defender, quickMove, false)).toBe(
      expectedQuickDamage
    );
    expect(calculateDamage(attacker, defender, quickMove, true)).toBe(
      Math.floor(expectedQuickDamage / 2)
    );
  });

  it('caps quick and guard energy at two Sun', () => {
    const quickSession = forceBotMove({
      ...makeSession(),
      player: { ...makeSession().player, energy: 2 },
    }, 'guard', 'building');
    const guardedSession = forceBotMove({
      ...makeSession(),
      player: { ...makeSession().player, energy: 1 },
    }, 'quick', 'building');

    expect(resolvePlayerAction(quickSession, 'quick', ACTIVE_TRANSITION).player.energy).toBe(
      2
    );
    expect(resolvePlayerAction(guardedSession, 'guard', ACTIVE_TRANSITION).player.energy).toBe(
      2
    );
  });

  it('consumes two Sun for signature and rejects it without enough energy', () => {
    const base = makeSession();
    const twoSunSession = forceBotMove({
      ...base,
      player: { ...base.player, energy: 2 },
    }, 'guard', 'building');
    const zeroSunSession = forceBotMove({
      ...base,
      player: { ...base.player, energy: 0 },
    }, 'guard', 'building');

    expect(
      resolvePlayerAction(twoSunSession, 'signature', ACTIVE_TRANSITION).player.energy
    ).toBe(0);
    expect(() =>
      resolvePlayerAction(zeroSunSession, 'signature', ACTIVE_TRANSITION)
    ).toThrow(
      'insufficient_energy'
    );
  });

  it('heals 25 percent once, caps at max HP, and rejects invalid heals', () => {
    const base = makeSession();
    const damagedSession = forceBotMove({
      ...base,
      player: { ...base.player, currentHp: 50, maxHp: 100 },
    }, 'guard', 'building');
    const almostFullSession = forceBotMove({
      ...base,
      player: { ...base.player, currentHp: 90, maxHp: 100 },
    }, 'guard', 'building');
    const healUsedSession = forceBotMove({
      ...damagedSession,
      player: { ...damagedSession.player, healUsed: true },
    }, 'guard', 'building');

    expect(
      resolvePlayerAction(damagedSession, 'photosynthesis', ACTIVE_TRANSITION).player
    ).toMatchObject({ currentHp: 75, healUsed: true });
    expect(
      resolvePlayerAction(almostFullSession, 'photosynthesis', ACTIVE_TRANSITION).player
        .currentHp
    ).toBe(100);
    expect(() =>
      resolvePlayerAction(healUsedSession, 'photosynthesis', ACTIVE_TRANSITION)
    ).toThrow('heal_already_used');
    expect(() =>
      resolvePlayerAction(base, 'photosynthesis', ACTIVE_TRANSITION)
    ).toThrow('full_health');
  });

  it('applies Guard to the whole round even when the defender is slower', () => {
    const base = makeSession({
      stats: { hp: 100, attack: 60, defense: 40, speed: 1 },
    });
    const session = forceBotMove(base, 'quick', 'building');
    const botQuick = session.bot.moves.find((move) => move.id === 'quick')!;
    const unguardedDamage = calculateDamage(session.bot, session.player, botQuick, false);

    const resolved = resolvePlayerAction(session, 'guard', ACTIVE_TRANSITION);

    expect(resolved.player.currentHp).toBe(
      session.player.maxHp - Math.floor(unguardedDamage / 2)
    );
    expect(resolved.player.energy).toBe(1);
  });

  it('uses player-first speed ties and skips the bot action after a faint', () => {
    const base = makeSession({
      stats: { hp: 100, attack: 200, defense: 40, speed: 50 },
    });
    const fastWinningSession = forceBotMove({
      ...base,
      player: { ...base.player, energy: 2 },
      bot: {
        ...base.bot,
        currentHp: 5,
        stats: { ...base.bot.stats, speed: 50 },
      },
    }, 'quick', 'uncertain');

    const fastWinningRound = resolvePlayerAction(fastWinningSession, 'signature', {
      transitionAt: WIN_AT,
    });

    expect(fastWinningRound.status).toBe('won');
    expect(fastWinningRound.phase).toBe('TERMINAL');
    expect(fastWinningRound.bot.currentHp).toBe(0);
    expect(fastWinningRound.player.currentHp).toBe(fastWinningSession.player.currentHp);
    expect(
      fastWinningRound.log.some((event) => event.type === 'bot_action_skipped')
    ).toBe(true);
    expect(fastWinningRound.pendingBotMoveId).toBeNull();
    expect(fastWinningRound.botIntent).toBeNull();
    expect(fastWinningRound.xpAwarded).toBe(20);
    expect(fastWinningRound.rewardApplied).toBe(false);
    expect(fastWinningRound.updatedAt).toBe(WIN_AT);
    expect(fastWinningRound.completedAt).toBe(WIN_AT);
  });

  it('skips the slower player action when Thornback causes a faint', () => {
    const base = makeSession({
      stats: { hp: 100, attack: 20, defense: 0, speed: 1 },
    });
    const losingSession = forceBotMove({
      ...base,
      player: { ...base.player, currentHp: 1 },
      bot: { ...base.bot, energy: 2 },
    }, 'signature', 'uncertain');

    const result = resolvePlayerAction(losingSession, 'quick', {
      transitionAt: LOSS_AT,
    });

    expect(result.status).toBe('lost');
    expect(result.player.currentHp).toBe(0);
    expect(result.log.some((event) => event.type === 'player_action_skipped')).toBe(
      true
    );
    expect(result.xpAwarded).toBe(5);
    expect(result.updatedAt).toBe(LOSS_AT);
    expect(result.completedAt).toBe(LOSS_AT);
  });

  it('returns active rounds only after preparing the next intent', () => {
    const base = makeSession();
    const session = forceBotMove(base, 'guard', 'building');

    const resolved = resolvePlayerAction(session, 'quick', {
      transitionAt: ACTIVE_ROUND_AT,
    });

    expect(resolved).toMatchObject({
      status: 'active',
      phase: 'PLAYER_ACTION',
      turnNumber: 2,
      rngStep: session.rngStep + 2,
    });
    expect(resolved.pendingBotMoveId).not.toBeNull();
    expect(resolved.botIntent).not.toBeNull();
    expect(resolved.updatedAt).toBe(ACTIVE_ROUND_AT);
    expect(resolved.completedAt).toBeNull();
  });

  it('consumes an accuracy roll for every damaging action, including quick', () => {
    const base = makeSession();
    const session = forceBotMove(base, 'guard', 'building');

    const resolved = resolvePlayerAction(session, 'quick', ACTIVE_TRANSITION);

    // Player quick consumes one roll; next-turn bot selection consumes one more.
    expect(resolved.rngStep).toBe(session.rngStep + 2);
  });

  it('does not mutate the supplied session or its nested snapshots', () => {
    const mutable = forceBotMove(makeSession(), 'guard', 'building');
    const snapshot = JSON.parse(JSON.stringify(mutable)) as BattleSession;
    const frozen = deepFreeze(mutable);

    const resolved = resolvePlayerAction(frozen, 'quick', ACTIVE_TRANSITION);

    expect(mutable).toEqual(snapshot);
    expect(resolved).not.toBe(mutable);
    expect(resolved.player).not.toBe(mutable.player);
    expect(resolved.log).not.toBe(mutable.log);
  });
});

describe('terminal outcomes and progression', () => {
  it('calculates exact win, loss, and abandon deltas', () => {
    expect(calculateProgression('won')).toEqual({
      xp: 20,
      wins: 1,
      losses: 0,
      streak: 'increment',
    });
    expect(calculateProgression('lost')).toEqual({
      xp: 5,
      wins: 0,
      losses: 1,
      streak: 'reset',
    });
    expect(calculateProgression('abandoned')).toEqual({
      xp: 0,
      wins: 0,
      losses: 0,
      streak: 'unchanged',
    });
  });

  it('abandons immutably without applying progression and is idempotent', () => {
    const session = makeSession();
    const abandoned = abandonBattle(session, { transitionAt: ABANDONED_AT });

    expect(abandoned).toMatchObject({
      status: 'abandoned',
      phase: 'TERMINAL',
      pendingBotMoveId: null,
      botIntent: null,
      xpAwarded: 0,
      rewardApplied: false,
      updatedAt: ABANDONED_AT,
      completedAt: ABANDONED_AT,
    });
    expect(session.status).toBe('active');
    expect(
      abandonBattle(abandoned, { transitionAt: '2026-07-22T08:05:00.000Z' })
    ).toBe(abandoned);
  });

  it('rejects malformed and non-advancing transition timestamps', () => {
    const session = makeSession();
    const abandoned = abandonBattle(session, { transitionAt: ABANDONED_AT });

    expect(() =>
      resolvePlayerAction(session, 'quick', { transitionAt: 'not-a-timestamp' })
    ).toThrow('invalid_transition_timestamp');
    expect(() =>
      abandonBattle(session, { transitionAt: session.updatedAt })
    ).toThrow('invalid_transition_timestamp');
    expect(() =>
      abandonBattle(abandoned, { transitionAt: 'not-a-timestamp' })
    ).toThrow('invalid_transition_timestamp');
  });

  it('rejects unknown moves, wrong phases, and actions on terminal sessions', () => {
    const session = makeSession();

    expect(() =>
      resolvePlayerAction(session, 'not-a-move', ACTIVE_TRANSITION)
    ).toThrow('invalid_move');
    expect(() =>
      resolvePlayerAction(
        { ...session, phase: 'RESOLVE_ROUND' },
        'quick',
        ACTIVE_TRANSITION
      )
    ).toThrow('invalid_battle_phase');
    expect(() =>
      resolvePlayerAction(
        abandonBattle(session, { transitionAt: ABANDONED_AT }),
        'quick',
        { transitionAt: '2026-07-22T08:05:00.000Z' }
      )
    ).toThrow('battle_not_active');
  });
});
