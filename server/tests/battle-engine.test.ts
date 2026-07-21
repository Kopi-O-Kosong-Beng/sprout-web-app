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

const basePlayer: AvatarBattleInput = {
  id: 'avatar-1',
  name: 'Helianthus annuus',
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
  intent: BattleIntent = 'attacking'
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
      name: 'Bellis perennis',
    });
    const fallback = makeSession({
      id: 'avatar-3',
      name: 'Unknown specimen',
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
    }, 'guard', 'guarding');
    const guardedSession = forceBotMove({
      ...makeSession(),
      player: { ...makeSession().player, energy: 1 },
    }, 'quick', 'charging');

    expect(resolvePlayerAction(quickSession, 'quick').player.energy).toBe(2);
    expect(resolvePlayerAction(guardedSession, 'guard').player.energy).toBe(2);
  });

  it('consumes two Sun for signature and rejects it without enough energy', () => {
    const base = makeSession();
    const twoSunSession = forceBotMove({
      ...base,
      player: { ...base.player, energy: 2 },
    }, 'guard', 'guarding');
    const zeroSunSession = forceBotMove({
      ...base,
      player: { ...base.player, energy: 0 },
    }, 'guard', 'guarding');

    expect(resolvePlayerAction(twoSunSession, 'signature').player.energy).toBe(0);
    expect(() => resolvePlayerAction(zeroSunSession, 'signature')).toThrow(
      'insufficient_energy'
    );
  });

  it('heals 25 percent once, caps at max HP, and rejects invalid heals', () => {
    const base = makeSession();
    const damagedSession = forceBotMove({
      ...base,
      player: { ...base.player, currentHp: 50, maxHp: 100 },
    }, 'guard', 'guarding');
    const almostFullSession = forceBotMove({
      ...base,
      player: { ...base.player, currentHp: 90, maxHp: 100 },
    }, 'guard', 'guarding');
    const healUsedSession = forceBotMove({
      ...damagedSession,
      player: { ...damagedSession.player, healUsed: true },
    }, 'guard', 'guarding');

    expect(resolvePlayerAction(damagedSession, 'photosynthesis').player).toMatchObject({
      currentHp: 75,
      healUsed: true,
    });
    expect(resolvePlayerAction(almostFullSession, 'photosynthesis').player.currentHp).toBe(
      100
    );
    expect(() => resolvePlayerAction(healUsedSession, 'photosynthesis')).toThrow(
      'heal_already_used'
    );
    expect(() => resolvePlayerAction(base, 'photosynthesis')).toThrow('full_health');
  });

  it('applies Guard to the whole round even when the defender is slower', () => {
    const base = makeSession({
      stats: { hp: 100, attack: 60, defense: 40, speed: 1 },
    });
    const session = forceBotMove(base, 'quick', 'charging');
    const botQuick = session.bot.moves.find((move) => move.id === 'quick')!;
    const unguardedDamage = calculateDamage(session.bot, session.player, botQuick, false);

    const resolved = resolvePlayerAction(session, 'guard');

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
    }, 'quick', 'charging');

    const fastWinningRound = resolvePlayerAction(fastWinningSession, 'signature');

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
  });

  it('skips the slower player action when Thornback causes a faint', () => {
    const base = makeSession({
      stats: { hp: 100, attack: 20, defense: 0, speed: 1 },
    });
    const losingSession = forceBotMove({
      ...base,
      player: { ...base.player, currentHp: 1 },
      bot: { ...base.bot, energy: 2 },
    }, 'signature', 'attacking');

    const result = resolvePlayerAction(losingSession, 'quick');

    expect(result.status).toBe('lost');
    expect(result.player.currentHp).toBe(0);
    expect(result.log.some((event) => event.type === 'player_action_skipped')).toBe(
      true
    );
    expect(result.xpAwarded).toBe(5);
  });

  it('returns active rounds only after preparing the next intent', () => {
    const base = makeSession();
    const session = forceBotMove(base, 'guard', 'guarding');

    const resolved = resolvePlayerAction(session, 'quick');

    expect(resolved).toMatchObject({
      status: 'active',
      phase: 'PLAYER_ACTION',
      turnNumber: 2,
      rngStep: session.rngStep + 2,
    });
    expect(resolved.pendingBotMoveId).not.toBeNull();
    expect(resolved.botIntent).not.toBeNull();
  });

  it('consumes an accuracy roll for every damaging action, including quick', () => {
    const base = makeSession();
    const session = forceBotMove(base, 'guard', 'guarding');

    const resolved = resolvePlayerAction(session, 'quick');

    // Player quick consumes one roll; next-turn bot selection consumes one more.
    expect(resolved.rngStep).toBe(session.rngStep + 2);
  });

  it('does not mutate the supplied session or its nested snapshots', () => {
    const mutable = forceBotMove(makeSession(), 'guard', 'guarding');
    const snapshot = JSON.parse(JSON.stringify(mutable)) as BattleSession;
    const frozen = deepFreeze(mutable);

    const resolved = resolvePlayerAction(frozen, 'quick');

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
    const abandoned = abandonBattle(session);

    expect(abandoned).toMatchObject({
      status: 'abandoned',
      phase: 'TERMINAL',
      pendingBotMoveId: null,
      botIntent: null,
      xpAwarded: 0,
      rewardApplied: false,
      completedAt: NOW,
    });
    expect(session.status).toBe('active');
    expect(abandonBattle(abandoned)).toBe(abandoned);
  });

  it('rejects unknown moves, wrong phases, and actions on terminal sessions', () => {
    const session = makeSession();

    expect(() => resolvePlayerAction(session, 'not-a-move')).toThrow('invalid_move');
    expect(() =>
      resolvePlayerAction({ ...session, phase: 'RESOLVE_ROUND' }, 'quick')
    ).toThrow('invalid_battle_phase');
    expect(() => resolvePlayerAction(abandonBattle(session), 'quick')).toThrow(
      'battle_not_active'
    );
  });
});
