import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import type { AuthUserProfile } from '../models/auth';
import type { BattleSession } from '../models/battle';
import authUserRepository from '../repositories/auth-users';
import {
  createBattleRepository,
  decodeBattleSession,
} from '../repositories/battles';
import { createBattle } from '../services/battle-engine';
import { clearFirestore } from './firestore-test-utils';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const SESSION_ID = 'battle-1';
const AVATAR_ID = 'avatar-1';
const CREATED_AT = '2026-07-22T08:00:00.000Z';
const ACTION_AT = '2026-07-22T08:01:00.000Z';
const LATER_ACTION_AT = '2026-07-22T08:02:00.000Z';

function makeProfile(
  overrides: Partial<AuthUserProfile> = {}
): AuthUserProfile {
  return {
    id: USER_ID,
    email: 'user-1@example.com',
    displayName: 'User One',
    isVerified: true,
    passwordHash: 'password-hash',
    pveXp: 0,
    pveWins: 0,
    pveLosses: 0,
    currentPveWinStreak: 0,
    bestPveWinStreak: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeSession(overrides: Partial<BattleSession> = {}): BattleSession {
  const session = createBattle({
    id: SESSION_ID,
    userId: USER_ID,
    avatarId: AVATAR_ID,
    player: {
      id: AVATAR_ID,
      name: 'Helianthus annuus',
      speciesFamily: 'Asteraceae',
      spriteUrl: '/static/sprites/helianthus-annuus.png',
      stats: { hp: 100, attack: 60, defense: 40, speed: 70 },
    },
    rngSeed: 12345,
    now: CREATED_AT,
  });
  return { ...session, ...overrides };
}

function makeRoundSession(): BattleSession {
  const session = makeSession();
  return {
    ...session,
    pendingBotMoveId: 'guard',
    botIntent: 'building',
  };
}

function makeWinningSession(): BattleSession {
  const session = makeRoundSession();
  return {
    ...session,
    bot: { ...session.bot, currentHp: 1 },
    botIntent: 'uncertain',
    log: session.log.map((event) =>
      event.type === 'bot_intent_prepared'
        ? { ...event, intent: 'uncertain' as const }
        : event
    ),
  };
}

function makeLosingSession(): BattleSession {
  const session = makeRoundSession();
  return {
    ...session,
    player: {
      ...session.player,
      currentHp: 1,
      stats: { ...session.player.stats, speed: 1 },
    },
    pendingBotMoveId: 'quick',
  };
}

function repositoryAt(timestamp: string, clock = jest.fn(() => new Date(timestamp))) {
  return { repository: createBattleRepository({ clock }), clock };
}

async function seedProfile(profile: object = makeProfile()) {
  await getDb().collection('users').doc(USER_ID).set({ ...profile });
}

async function seedSession(session: BattleSession = makeSession()) {
  await getDb().collection('battle_sessions').doc(session.id).set(session);
}

async function storedSession(): Promise<BattleSession> {
  const snapshot = await getDb().collection('battle_sessions').doc(SESSION_ID).get();
  return decodeBattleSession(snapshot);
}

async function storedProfile(): Promise<FirebaseFirestore.DocumentData | undefined> {
  return (await getDb().collection('users').doc(USER_ID).get()).data();
}

describe('Firestore battle repository', () => {
  beforeEach(clearFirestore);

  it('creates a validated session and reads it only for its owner', async () => {
    const { repository } = repositoryAt(ACTION_AT);
    const session = makeSession();

    await expect(repository.create(session)).resolves.toEqual(session);
    await expect(repository.getOwned(USER_ID, SESSION_ID)).resolves.toEqual(session);
    await expect(repository.getOwned(OTHER_USER_ID, SESSION_ID)).resolves.toBeNull();
    await expect(repository.getOwned(USER_ID, 'missing-session')).resolves.toBeNull();
  });

  it('rejects a foreign session without mutation', async () => {
    const { repository, clock } = repositoryAt(ACTION_AT);
    const before = makeRoundSession();
    await seedSession(before);

    await expect(
      repository.applyAction(OTHER_USER_ID, SESSION_ID, 'quick', 1)
    ).rejects.toMatchObject({
      name: 'BattleRepositoryError',
      code: 'battle_not_found',
      status: 404,
    });
    await expect(storedSession()).resolves.toEqual(before);
    expect(clock).not.toHaveBeenCalled();
  });

  it('returns stale state without duplicate damage or advancing repository time', async () => {
    const { repository, clock } = repositoryAt(ACTION_AT);
    await seedProfile();
    await seedSession(makeRoundSession());

    const first = await repository.applyAction(USER_ID, SESSION_ID, 'quick', 1);
    const firstProfile = await storedProfile();
    const stale = await repository.applyAction(USER_ID, SESSION_ID, 'quick', 1);

    expect(first.stale).toBe(false);
    expect(stale).toEqual({ session: first.session, stale: true });
    expect(stale.session.updatedAt).toBe(ACTION_AT);
    expect(await storedProfile()).toEqual(firstProfile);
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it('resolves concurrent duplicate rounds once and returns one stale snapshot', async () => {
    const { repository } = repositoryAt(ACTION_AT);
    await seedSession(makeRoundSession());

    const results = await Promise.all([
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1),
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1),
    ]);
    const authoritative = results.find((result) => !result.stale)!;
    const stale = results.find((result) => result.stale)!;

    expect(results.map((result) => result.stale).sort()).toEqual([false, true]);
    expect(stale.session).toEqual(authoritative.session);
    expect(authoritative.session.turnNumber).toBe(2);
    await expect(storedSession()).resolves.toEqual(authoritative.session);
  });

  it('rejects a future expected turn without mutation', async () => {
    const { repository, clock } = repositoryAt(ACTION_AT);
    const before = makeRoundSession();
    await seedSession(before);

    await expect(
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 2)
    ).rejects.toMatchObject({
      name: 'BattleRepositoryError',
      code: 'future_turn',
      status: 409,
    });
    await expect(storedSession()).resolves.toEqual(before);
    expect(clock).not.toHaveBeenCalled();
  });

  it('rejects non-positive, fractional, and non-finite expected turns', async () => {
    const { repository, clock } = repositoryAt(ACTION_AT);
    await seedSession(makeRoundSession());

    for (const expectedTurn of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        repository.applyAction(USER_ID, SESSION_ID, 'quick', expectedTurn)
      ).rejects.toMatchObject({ code: 'invalid_expected_turn', status: 400 });
    }
    expect(clock).not.toHaveBeenCalled();
  });

  it('persists one full round, increments the turn, and uses one canonical clock value', async () => {
    const { repository, clock } = repositoryAt(ACTION_AT);
    await seedSession(makeRoundSession());

    const result = await repository.applyAction(USER_ID, SESSION_ID, 'quick', 1);

    expect(result).toMatchObject({
      stale: false,
      session: {
        status: 'active',
        phase: 'PLAYER_ACTION',
        turnNumber: 2,
        updatedAt: ACTION_AT,
        completedAt: null,
      },
    });
    expect(result.session.player.energy).toBe(1);
    await expect(storedSession()).resolves.toEqual(result.session);
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it('advances a transition by one millisecond when the clock does not exceed updatedAt', async () => {
    const { repository } = repositoryAt(CREATED_AT);
    await seedSession(makeRoundSession());

    const result = await repository.applyAction(USER_ID, SESSION_ID, 'quick', 1);

    expect(result.session.updatedAt).toBe('2026-07-22T08:00:00.001Z');
  });

  it('applies win XP and streak exactly once under concurrent duplicate actions', async () => {
    const { repository } = repositoryAt(ACTION_AT);
    await seedProfile(
      makeProfile({
        pveXp: 10,
        pveWins: 2,
        pveLosses: 1,
        currentPveWinStreak: 2,
        bestPveWinStreak: 2,
      })
    );
    await seedSession(makeWinningSession());

    const attempts = await Promise.allSettled([
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1),
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: { code: 'battle_not_active', status: 409 },
    });
    await expect(storedSession()).resolves.toMatchObject({
      status: 'won',
      rewardApplied: true,
      xpAwarded: 20,
      updatedAt: ACTION_AT,
      completedAt: ACTION_AT,
    });
    await expect(storedProfile()).resolves.toMatchObject({
      pveXp: 30,
      pveWins: 3,
      pveLosses: 1,
      currentPveWinStreak: 3,
      bestPveWinStreak: 3,
    });
  });

  it('applies loss XP and resets current streak exactly once under concurrency', async () => {
    const { repository } = repositoryAt(ACTION_AT);
    await seedProfile(
      makeProfile({
        pveXp: 10,
        pveWins: 4,
        pveLosses: 2,
        currentPveWinStreak: 4,
        bestPveWinStreak: 7,
      })
    );
    await seedSession(makeLosingSession());

    const attempts = await Promise.allSettled([
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1),
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await expect(storedSession()).resolves.toMatchObject({
      status: 'lost',
      rewardApplied: true,
      xpAwarded: 5,
    });
    await expect(storedProfile()).resolves.toMatchObject({
      pveXp: 15,
      pveWins: 4,
      pveLosses: 3,
      currentPveWinStreak: 0,
      bestPveWinStreak: 7,
    });
  });

  it('leaves the battle active when a terminal reward profile is missing', async () => {
    const { repository } = repositoryAt(ACTION_AT);
    const before = makeWinningSession();
    await seedSession(before);

    await expect(
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1)
    ).rejects.toMatchObject({
      name: 'BattleRepositoryError',
      code: 'battle_profile_missing',
      status: 409,
    });
    await expect(storedSession()).resolves.toEqual(before);
  });

  it('abandons without progression and returns an already abandoned session unchanged', async () => {
    const { repository, clock } = repositoryAt(ACTION_AT);
    await seedProfile(
      makeProfile({
        pveXp: 30,
        pveWins: 2,
        pveLosses: 1,
        currentPveWinStreak: 2,
        bestPveWinStreak: 3,
      })
    );
    await seedSession(makeRoundSession());
    const beforeProfile = await storedProfile();

    const abandoned = await repository.abandon(USER_ID, SESSION_ID);
    const repeated = await repository.abandon(USER_ID, SESSION_ID);

    expect(abandoned).toMatchObject({
      status: 'abandoned',
      phase: 'TERMINAL',
      rewardApplied: false,
      xpAwarded: 0,
      updatedAt: ACTION_AT,
      completedAt: ACTION_AT,
    });
    expect(repeated).toEqual(abandoned);
    expect(await storedProfile()).toEqual(beforeProfile);
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it('rejects actions and abandon requests after win or loss', async () => {
    const { repository, clock } = repositoryAt(LATER_ACTION_AT);
    await seedProfile();
    await seedSession(makeWinningSession());
    await repository.applyAction(USER_ID, SESSION_ID, 'quick', 1);

    await expect(
      repository.applyAction(USER_ID, SESSION_ID, 'quick', 1)
    ).rejects.toMatchObject({ code: 'battle_not_active', status: 409 });
    await expect(repository.abandon(USER_ID, SESSION_ID)).rejects.toMatchObject({
      code: 'battle_not_active',
      status: 409,
    });
    expect(clock).toHaveBeenCalledTimes(1);
  });
});

describe('PVE profile defaults', () => {
  beforeEach(clearFirestore);

  it('normalizes all missing legacy progression fields to zero', async () => {
    const legacy = makeProfile();
    delete (legacy as Partial<AuthUserProfile>).pveXp;
    delete (legacy as Partial<AuthUserProfile>).pveWins;
    delete (legacy as Partial<AuthUserProfile>).pveLosses;
    delete (legacy as Partial<AuthUserProfile>).currentPveWinStreak;
    delete (legacy as Partial<AuthUserProfile>).bestPveWinStreak;
    await seedProfile(legacy);

    await expect(authUserRepository.getById(USER_ID)).resolves.toMatchObject({
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: 0,
    });
  });

  it('initializes all progression fields for a new profile', async () => {
    const created = await authUserRepository.createProfile({
      id: USER_ID,
      email: 'new@example.com',
      displayName: 'New User',
      isVerified: false,
      passwordHash: 'password-hash',
    });

    expect(created).toMatchObject({
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: 0,
    });
    await expect(storedProfile()).resolves.toMatchObject({
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: 0,
    });
  });

  it('applies a win against a legacy profile from normalized zero values', async () => {
    const legacy = makeProfile();
    delete (legacy as Partial<AuthUserProfile>).pveXp;
    delete (legacy as Partial<AuthUserProfile>).pveWins;
    delete (legacy as Partial<AuthUserProfile>).pveLosses;
    delete (legacy as Partial<AuthUserProfile>).currentPveWinStreak;
    delete (legacy as Partial<AuthUserProfile>).bestPveWinStreak;
    await seedProfile(legacy);
    await seedSession(makeWinningSession());

    await repositoryAt(ACTION_AT).repository.applyAction(
      USER_ID,
      SESSION_ID,
      'quick',
      1
    );

    await expect(storedProfile()).resolves.toMatchObject({
      pveXp: 20,
      pveWins: 1,
      pveLosses: 0,
      currentPveWinStreak: 1,
      bestPveWinStreak: 1,
    });
  });
});

type MutableBattleDocument = Record<string, any>;

function cloneDocument(session: BattleSession = makeSession()): MutableBattleDocument {
  return JSON.parse(JSON.stringify(session)) as MutableBattleDocument;
}

const malformedBattleCases: Array<{
  name: string;
  mutate(document: MutableBattleDocument): void;
}> = [
  { name: 'status enum', mutate: (document) => (document.status = 'paused') },
  { name: 'phase enum', mutate: (document) => (document.phase = 'WAITING') },
  {
    name: 'move catalog version',
    mutate: (document) => (document.moveCatalogVersion = 'v2'),
  },
  {
    name: 'NPC preset version',
    mutate: (document) => (document.npcPresetVersion = 'thornback-v2'),
  },
  { name: 'document ID', mutate: (document) => (document.id = 'other-battle') },
  { name: 'owner ID', mutate: (document) => (document.userId = '') },
  { name: 'avatar relationship', mutate: (document) => (document.avatarId = 'other') },
  { name: 'bot identity', mutate: (document) => (document.bot.id = 'other-bot') },
  {
    name: 'participant max HP relationship',
    mutate: (document) => (document.player.maxHp = document.player.stats.hp + 1),
  },
  {
    name: 'negative participant stats',
    mutate: (document) => (document.player.stats.defense = -1),
  },
  {
    name: 'HP bounds',
    mutate: (document) => (document.player.currentHp = document.player.maxHp + 1),
  },
  { name: 'energy bounds', mutate: (document) => (document.player.energy = 3) },
  { name: 'heal-used type', mutate: (document) => (document.player.healUsed = 'no') },
  {
    name: 'move kind enum',
    mutate: (document) => (document.player.moves[0].kind = 'burst'),
  },
  {
    name: 'duplicate move IDs',
    mutate: (document) => (document.player.moves[1].id = 'quick'),
  },
  {
    name: 'move numeric legality',
    mutate: (document) => (document.player.moves[2].accuracy = 101),
  },
  {
    name: 'versioned quick power',
    mutate: (document) => (document.player.moves[0].power = 23),
  },
  {
    name: 'versioned signature accuracy',
    mutate: (document) => (document.player.moves[2].accuracy = 100),
  },
  {
    name: 'pending move existence',
    mutate: (document) => (document.pendingBotMoveId = 'missing'),
  },
  {
    name: 'pending signature affordability',
    mutate: (document) => {
      document.pendingBotMoveId = 'signature';
      document.botIntent = 'uncertain';
      document.bot.energy = 0;
    },
  },
  {
    name: 'pending heal legality',
    mutate: (document) => {
      document.pendingBotMoveId = 'photosynthesis';
      document.botIntent = 'uncertain';
      document.bot.currentHp = document.bot.maxHp;
    },
  },
  {
    name: 'active phase consistency',
    mutate: (document) => (document.phase = 'TERMINAL'),
  },
  {
    name: 'active intent consistency',
    mutate: (document) => (document.botIntent = null),
  },
  {
    name: 'RNG seed bounds',
    mutate: (document) => (document.rngSeed = 0x1_0000_0000),
  },
  { name: 'RNG state integer', mutate: (document) => (document.rngState = 1.5) },
  { name: 'RNG step relationship', mutate: (document) => (document.rngStep = 0) },
  { name: 'RNG state trajectory', mutate: (document) => (document.rngState = 0) },
  { name: 'reward flag type', mutate: (document) => (document.rewardApplied = 'no') },
  { name: 'active XP consistency', mutate: (document) => (document.xpAwarded = 20) },
  { name: 'created timestamp', mutate: (document) => (document.createdAt = 'yesterday') },
  {
    name: 'timestamp ordering',
    mutate: (document) => (document.updatedAt = '2026-07-22T07:59:59.999Z'),
  },
  {
    name: 'active completion timestamp',
    mutate: (document) => (document.completedAt = ACTION_AT),
  },
  { name: 'battle log type', mutate: (document) => (document.log = 'not-an-array') },
  {
    name: 'event type enum',
    mutate: (document) => (document.log[0].type = 'unknown_event'),
  },
  {
    name: 'event actor enum',
    mutate: (document) => (document.log[0].actor = 'spectator'),
  },
  {
    name: 'event turn relationship',
    mutate: (document) => (document.log[0].turnNumber = 2),
  },
  {
    name: 'event move relationship',
    mutate: (document) => {
      document.log.push({
        turnNumber: 1,
        type: 'move_used',
        actor: 'player',
        moveId: 'missing',
        message: 'Invalid move.',
      });
    },
  },
  {
    name: 'event amount legality',
    mutate: (document) => {
      document.log.push({
        turnNumber: 1,
        type: 'damage_dealt',
        actor: 'player',
        moveId: 'quick',
        amount: -1,
        message: 'Invalid damage.',
      });
    },
  },
  {
    name: 'event outcome sequence',
    mutate: (document) => {
      document.log.push({
        turnNumber: 1,
        type: 'damage_dealt',
        actor: 'player',
        moveId: 'quick',
        amount: 1,
        message: 'Unpaired damage.',
      });
    },
  },
  {
    name: 'event outcome move kind',
    mutate: (document) => {
      document.log.push(
        {
          turnNumber: 1,
          type: 'move_used',
          actor: 'player',
          moveId: 'guard',
          message: 'Guard.',
        },
        {
          turnNumber: 1,
          type: 'damage_dealt',
          actor: 'player',
          moveId: 'guard',
          amount: 1,
          message: 'Illegal guard damage.',
        }
      );
    },
  },
  {
    name: 'current intent log relationship',
    mutate: (document) => (document.botIntent = 'committed'),
  },
  {
    name: 'terminal outcome HP relationship',
    mutate: (document) => {
      document.status = 'won';
      document.phase = 'TERMINAL';
      document.pendingBotMoveId = null;
      document.botIntent = null;
      document.rewardApplied = true;
      document.xpAwarded = 20;
      document.updatedAt = ACTION_AT;
      document.completedAt = ACTION_AT;
      document.log.push({
        turnNumber: 1,
        type: 'battle_won',
        actor: 'system',
        message: 'Victory.',
      });
    },
  },
  {
    name: 'terminal event relationship',
    mutate: (document) => {
      document.status = 'abandoned';
      document.phase = 'TERMINAL';
      document.pendingBotMoveId = null;
      document.botIntent = null;
      document.updatedAt = ACTION_AT;
      document.completedAt = ACTION_AT;
    },
  },
  {
    name: 'abandon reward relationship',
    mutate: (document) => {
      document.status = 'abandoned';
      document.phase = 'TERMINAL';
      document.pendingBotMoveId = null;
      document.botIntent = null;
      document.rewardApplied = true;
      document.updatedAt = ACTION_AT;
      document.completedAt = ACTION_AT;
      document.log.push({
        turnNumber: 1,
        type: 'battle_abandoned',
        actor: 'system',
        message: 'Abandoned.',
      });
    },
  },
];

describe('battle document decoder invariants', () => {
  beforeEach(clearFirestore);

  it('normalizes Firestore timestamp values before engine resolution', async () => {
    const document = cloneDocument();
    document.createdAt = Timestamp.fromDate(new Date(CREATED_AT));
    document.updatedAt = Timestamp.fromDate(new Date(CREATED_AT));
    await getDb().collection('battle_sessions').doc(SESSION_ID).set(document);

    await expect(
      repositoryAt(ACTION_AT).repository.getOwned(USER_ID, SESSION_ID)
    ).resolves.toMatchObject({
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  });

  it.each(malformedBattleCases)('rejects malformed $name', async ({ mutate }) => {
    const document = cloneDocument();
    mutate(document);
    await getDb().collection('battle_sessions').doc(SESSION_ID).set(document);

    await expect(
      repositoryAt(ACTION_AT).repository.getOwned(USER_ID, SESSION_ID)
    ).rejects.toMatchObject({
      name: 'BattleRepositoryError',
      code: 'invalid_battle_document',
      status: 500,
      message: expect.stringContaining(
        `Invalid Firestore battle_sessions document ${SESSION_ID}`
      ),
    });
  });
});
