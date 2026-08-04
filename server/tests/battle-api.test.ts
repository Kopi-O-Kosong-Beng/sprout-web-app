import request, { type Response } from 'supertest';
import express from 'express';
import { MAX_BATTLE_ENERGY } from '../data/battle-rules';
import { getDb } from '../firebase';
import errorMiddleware from '../middleware/error.middleware';
import avatarRepository from '../repositories/avatars';
import battleRepository from '../repositories/battles';
import {
  PRODUCTION_BATTLE_ACTION_LIMIT_MAX,
  createBattleRouter,
} from '../routes/battle.routes';
import { createBattleService } from '../services/battle.service';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const CREATED_AT = '2026-07-23T01:00:00.000Z';
const STRONG_STATS = { hp: 500, attack: 1_000, defense: 500, speed: 500 };

let testSequence = 0;
let userId: string;
let otherUserId: string;

const INTERNAL_BATTLE_KEYS = new Set([
  'userId',
  'pendingBotMoveId',
  'rngSeed',
  'rngState',
  'rngStep',
  'moveCatalogVersion',
  'npcPresetVersion',
  'rewardApplied',
]);
const BOT_MOVE_NAMES = [
  'Thorn Jab',
  'Bramble Bastion',
  'Briar Barrage',
  'Photosynthesis',
];

function authorization(uid: string, verified = true): string {
  return `Bearer ${verified ? 'verified' : 'unverified'}:${uid}`;
}

function findForbiddenKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenKeys(item, `${path}[${index}]`)
    );
  }
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(INTERNAL_BATTLE_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...findForbiddenKeys(child, `${path}.${key}`),
  ]);
}

function expectedBotEventMessage(event: Record<string, unknown>): string {
  switch (event.type) {
    case 'bot_intent_prepared':
      return 'Opponent intent prepared.';
    case 'move_missed':
      return 'Opponent attack missed.';
    case 'damage_dealt':
      return `Opponent dealt ${event.amount} damage.`;
    case 'healed':
      return `Opponent recovered ${event.amount} HP.`;
    case 'bot_action_skipped':
      return 'Opponent fainted before acting.';
    default:
      return 'Opponent acted.';
  }
}

function expectPublicSession(session: Record<string, unknown>): void {
  expect(session).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      avatarId: expect.any(String),
      status: expect.any(String),
      turnNumber: expect.any(Number),
    })
  );
  expect(['building', 'committed', 'uncertain', null]).toContain(
    session.botIntent
  );
  expect(findForbiddenKeys(session)).toEqual([]);
  expect(session).not.toHaveProperty('bot.moves');
  expect(session.player).toEqual(
    expect.objectContaining({
      energy: expect.any(Number),
      maxEnergy: MAX_BATTLE_ENERGY,
    })
  );
  expect(session.bot).toEqual(
    expect.objectContaining({
      energy: expect.any(Number),
      maxEnergy: MAX_BATTLE_ENERGY,
      spriteUrl: '/sprites/thornback.png',
    })
  );

  const serialized = JSON.stringify(session);
  for (const botMoveName of BOT_MOVE_NAMES.slice(0, 3)) {
    expect(serialized).not.toContain(botMoveName);
  }

  const log = session.log as Array<Record<string, unknown>>;
  for (const event of log) {
    if (event.actor !== 'bot') continue;
    expect(event).not.toHaveProperty('moveId');
    expect(event.message).toBe(expectedBotEventMessage(event));
    for (const botMoveName of BOT_MOVE_NAMES) {
      expect(event.message).not.toContain(botMoveName);
    }
    if (event.type === 'bot_intent_prepared') {
      expect(['building', 'committed', 'uncertain']).toContain(event.intent);
    } else {
      expect(event).not.toHaveProperty('intent');
    }
  }
}

async function seedProfile(uid: string): Promise<void> {
  await getDb().collection('users').doc(uid).set({
    email: `${uid}@example.com`,
    displayName: `Player ${uid}`,
    isVerified: true,
    passwordHash: 'test-password-hash',
    pveXp: 0,
    pveWins: 0,
    pveLosses: 0,
    currentPveWinStreak: 0,
    bestPveWinStreak: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

interface SeedAvatarOptions {
  id?: string;
  ownerId?: string;
  displayName?: string;
  speciesName?: string;
  speciesFamily?: string | null;
  isTemporary?: boolean;
  expiresAt?: string | null;
  stats?: typeof STRONG_STATS;
}

async function seedAvatar(options: SeedAvatarOptions = {}): Promise<string> {
  const id = options.id ?? `avatar-${testSequence}`;
  await getDb().collection('avatar_records').doc(id).set({
    userId: options.ownerId ?? userId,
    speciesName: options.speciesName ?? 'Helianthus annuus',
    speciesFamily:
      options.speciesFamily === undefined ? 'Asteraceae' : options.speciesFamily,
    spriteUrl: '/static/sprites/helianthus-annuus.png',
    discoveredAt: CREATED_AT,
    source: options.isTemporary ? 'web' : 'mobile',
    isTemporary: options.isTemporary ?? false,
    expiresAt: options.expiresAt ?? null,
    stats: options.stats ?? STRONG_STATS,
    metadata: { displayName: options.displayName ?? 'Sunny' },
  });
  return id;
}

async function startBattle(
  uid = userId,
  avatarId?: string
): Promise<Response> {
  const selectedAvatarId = avatarId ?? (await seedAvatar({ ownerId: uid }));
  return request(app)
    .post('/api/battle/pve/start')
    .set('Authorization', authorization(uid))
    .send({ avatarId: selectedAvatarId });
}

async function readRawSession(
  sessionId: string
): Promise<FirebaseFirestore.DocumentData | undefined> {
  return (await getDb().collection('battle_sessions').doc(sessionId).get()).data();
}

function createRateLimitedBattleApp(actionLimitMax: number) {
  const rateLimitedApp = express();
  rateLimitedApp.use(express.json());
  rateLimitedApp.use(
    '/api/battle/pve',
    createBattleRouter({ actionLimitMax, startLimitMax: 100 })
  );
  rateLimitedApp.use(errorMiddleware);
  return rateLimitedApp;
}

beforeEach(async () => {
  testSequence += 1;
  userId = `battle-api-user-${testSequence}`;
  otherUserId = `battle-api-other-${testSequence}`;
  mockAuthAdmin.verifyIdToken.mockReset();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    const [kind, uid] = token.split(':');
    if ((kind !== 'verified' && kind !== 'unverified') || !uid) {
      throw new Error('raw Firebase token detail');
    }
    return {
      uid,
      email: `${uid}@example.com`,
      email_verified: kind === 'verified',
    };
  });
  await clearFirestore();
  await seedProfile(userId);
  await seedProfile(otherUserId);
});

describe('verified PVE battle API', () => {
  it('requires a verified Firebase ID token', async () => {
    const avatarId = await seedAvatar();

    const missing = await request(app)
      .post('/api/battle/pve/start')
      .send({ avatarId });
    const invalid = await request(app)
      .post('/api/battle/pve/start')
      .set('Authorization', 'Bearer invalid-token')
      .send({ avatarId });
    const unverified = await request(app)
      .post('/api/battle/pve/start')
      .set('Authorization', authorization(userId, false))
      .send({ avatarId });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(unverified.status).toBe(403);
    expect(await getDb().collection('battle_sessions').get()).toHaveProperty(
      'empty',
      true
    );
  });

  it('starts with an owned avatar, preserves display taxonomy, and redacts intent secrets', async () => {
    const avatarId = await seedAvatar({
      displayName: 'Sunbeam',
      speciesName: 'Helianthus annuus',
      speciesFamily: 'Asteraceae',
    });

    const response = await startBattle(userId, avatarId);

    expect(response.status).toBe(201);
    expectPublicSession(response.body);
    expect(response.body.player).toMatchObject({
      id: avatarId,
      name: 'Sunbeam',
      maxEnergy: MAX_BATTLE_ENERGY,
      moves: expect.arrayContaining([
        expect.objectContaining({ id: 'signature', name: 'Solar Bloom' }),
      ]),
    });
    expect(response.body.bot).toMatchObject({
      name: 'Thornback',
      maxEnergy: MAX_BATTLE_ENERGY,
      spriteUrl: '/sprites/thornback.png',
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const persisted = await readRawSession(response.body.id);
    expect(persisted).toMatchObject({
      id: response.body.id,
      userId,
      avatarId,
      player: { name: 'Sunbeam' },
      bot: { spriteUrl: '/sprites/thornback.png' },
      rngSeed: expect.any(Number),
      rngStep: 1,
      pendingBotMoveId: expect.any(String),
      botIntent: response.body.botIntent,
    });
    expect(Number.isInteger(persisted!.rngSeed)).toBe(true);
    expect(persisted!.rngSeed).toBeGreaterThanOrEqual(0);
    expect(persisted!.rngSeed).toBeLessThanOrEqual(0xffff_ffff);
    expect(
      persisted!.log.filter(
        (event: FirebaseFirestore.DocumentData) =>
          event.type === 'bot_intent_prepared'
      )
    ).toHaveLength(1);
  });

  it('hides missing, foreign, and expired temporary avatars behind the same 404', async () => {
    const foreignId = await seedAvatar({ id: 'foreign-avatar', ownerId: otherUserId });
    const malformedForeignId = 'malformed-foreign-avatar';
    await getDb().collection('avatar_records').doc(malformedForeignId).set({
      userId: otherUserId,
      privateMalformedDetail: 'must-not-reach-the-caller',
    });
    const expiredId = await seedAvatar({
      id: 'expired-avatar',
      isTemporary: true,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const responses = await Promise.all([
      startBattle(userId, 'missing-avatar'),
      startBattle(userId, foreignId),
      startBattle(userId, malformedForeignId),
      startBattle(userId, expiredId),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      404,
      404,
      404,
      404,
    ]);
    expect(responses.map((response) => response.body)).toEqual([
      { error: 'Avatar not found.' },
      { error: 'Avatar not found.' },
      { error: 'Avatar not found.' },
      { error: 'Avatar not found.' },
    ]);
  });

  it('accepts temporary avatars until their expiry actually passes', async () => {
    const futureId = await seedAvatar({
      id: 'future-avatar',
      isTemporary: true,
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
    const noExpiryId = await seedAvatar({
      id: 'temporary-without-expiry',
      isTemporary: true,
      expiresAt: null,
    });

    const future = await startBattle(userId, futureId);
    const noExpiry = await startBattle(userId, noExpiryId);

    expect(future.status).toBe(201);
    expect(noExpiry.status).toBe(201);
    expectPublicSession(future.body);
    expectPublicSession(noExpiry.body);
  });

  it('strictly rejects empty, malformed, and unknown start bodies', async () => {
    const avatarId = await seedAvatar();
    const invalidBodies: Array<object | undefined> = [
      undefined,
      {},
      { avatarId: '' },
      { avatarId: ' ' },
      { avatarId: 'a'.repeat(129) },
      { avatarId: 42 },
      { avatarId, unexpected: true },
      [],
    ];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post('/api/battle/pve/start')
        .set('Authorization', authorization(userId))
        .send(body);
      expect(response.status).toBe(400);
    }
    expect(await getDb().collection('battle_sessions').get()).toHaveProperty(
      'empty',
      true
    );
  });

  it('returns persisted public state from GET and hides missing or foreign sessions', async () => {
    const started = await startBattle();
    expect(started.status).toBe(201);

    const owned = await request(app)
      .get(`/api/battle/pve/${started.body.id}`)
      .set('Authorization', authorization(userId));
    const missing = await request(app)
      .get('/api/battle/pve/missing-session')
      .set('Authorization', authorization(userId));
    const foreign = await request(app)
      .get(`/api/battle/pve/${started.body.id}`)
      .set('Authorization', authorization(otherUserId));

    expect(owned.status).toBe(200);
    expect(owned.body).toEqual(started.body);
    expectPublicSession(owned.body);
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Battle session not found.' });
    expect(foreign.body).toEqual(missing.body);
  });

  it('keeps stored thornback-v1 sessions compatible across GET, action, and abandon', async () => {
    const started = await startBattle();
    const rawSession = await readRawSession(started.body.id);

    expect(rawSession).toMatchObject({
      npcPresetVersion: 'thornback-v1',
      bot: { spriteUrl: '/sprites/thornback.png' },
    });

    const read = await request(app)
      .get(`/api/battle/pve/${started.body.id}`)
      .set('Authorization', authorization(userId));
    const action = await request(app)
      .post(`/api/battle/pve/${started.body.id}/action`)
      .set('Authorization', authorization(userId))
      .send({ moveId: 'guard', expectedTurn: 1 });
    const abandoned = await request(app)
      .post(`/api/battle/pve/${started.body.id}/abandon`)
      .set('Authorization', authorization(userId))
      .send({});

    expect(read.status).toBe(200);
    expect(action.status).toBe(200);
    expect(abandoned.status).toBe(200);
    for (const session of [
      started.body,
      read.body,
      action.body.session,
      abandoned.body,
    ]) {
      expectPublicSession(session);
      expect(session.bot.spriteUrl).toBe('/sprites/thornback.png');
    }
  });

  it('strictly rejects empty or malformed session IDs and action bodies', async () => {
    const started = await startBattle();
    const malformedId = encodeURIComponent(' ');

    const emptyId = await request(app)
      .get('/api/battle/pve/')
      .set('Authorization', authorization(userId));
    const blankId = await request(app)
      .get(`/api/battle/pve/${malformedId}`)
      .set('Authorization', authorization(userId));
    const longId = await request(app)
      .get(`/api/battle/pve/${'a'.repeat(129)}`)
      .set('Authorization', authorization(userId));
    const invalidBodies: Array<object | undefined> = [
      undefined,
      {},
      { moveId: '', expectedTurn: 1 },
      { moveId: 'quick', expectedTurn: 0 },
      { moveId: 'quick', expectedTurn: '1' },
      { moveId: 'quick', expectedTurn: 1, unexpected: true },
    ];

    expect(emptyId.status).toBe(404);
    expect(blankId.status).toBe(400);
    expect(longId.status).toBe(400);
    for (const body of invalidBodies) {
      const response = await request(app)
        .post(`/api/battle/pve/${started.body.id}/action`)
        .set('Authorization', authorization(userId))
        .send(body);
      expect(response.status).toBe(400);
    }
    const persisted = await readRawSession(started.body.id);
    expect(persisted!.turnNumber).toBe(1);
  });

  it('rejects an unknown move without advancing persisted state', async () => {
    const started = await startBattle();

    const rejected = await request(app)
      .post(`/api/battle/pve/${started.body.id}/action`)
      .set('Authorization', authorization(userId))
      .send({ moveId: 'unknown-move', expectedTurn: 1 });
    const persisted = await request(app)
      .get(`/api/battle/pve/${started.body.id}`)
      .set('Authorization', authorization(userId));

    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({ error: 'Battle action is invalid.' });
    expect(persisted.body).toEqual(started.body);
  });

  it('resolves one same-turn request and returns a redacted stale snapshot for the other', async () => {
    const started = await startBattle();

    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app)
          .post(`/api/battle/pve/${started.body.id}/action`)
          .set('Authorization', authorization(userId))
          .send({ moveId: 'quick', expectedTurn: 1 })
      )
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.body.stale).sort()).toEqual([
      false,
      true,
    ]);
    for (const response of responses) expectPublicSession(response.body.session);
    expect(responses[0].body.session).toEqual(responses[1].body.session);

    const playerMoveEvent = responses[0].body.session.log.find(
      (event: Record<string, unknown>) =>
        event.actor === 'player' && event.type === 'move_used'
    );
    expect(playerMoveEvent).toMatchObject({
      moveId: 'quick',
      message: 'Sunny used Sunseed Strike.',
    });

    const persisted = await request(app)
      .get(`/api/battle/pve/${started.body.id}`)
      .set('Authorization', authorization(userId));
    expect(persisted.body).toEqual(responses[0].body.session);
  });

  it('abandons once without applying progression and strictly rejects an abandon body', async () => {
    const started = await startBattle();
    const rejected = await request(app)
      .post(`/api/battle/pve/${started.body.id}/abandon`)
      .set('Authorization', authorization(userId))
      .send({ unexpected: true });
    expect(rejected.status).toBe(400);

    const abandoned = await request(app)
      .post(`/api/battle/pve/${started.body.id}/abandon`)
      .set('Authorization', authorization(userId))
      .send({});
    const repeated = await request(app)
      .post(`/api/battle/pve/${started.body.id}/abandon`)
      .set('Authorization', authorization(userId))
      .send({});
    const profile = (
      await getDb().collection('users').doc(userId).get()
    ).data()!;

    expect(abandoned.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(abandoned.body).toEqual(repeated.body);
    expect(abandoned.body).toMatchObject({
      status: 'abandoned',
      xpAwarded: 0,
    });
    expectPublicSession(abandoned.body);
    expect(profile).toMatchObject({
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: 0,
    });
  });

  it('returns the same 404 for missing and foreign action or abandon requests', async () => {
    const started = await startBattle();
    const cases = [
      request(app)
        .post('/api/battle/pve/missing-session/action')
        .set('Authorization', authorization(userId))
        .send({ moveId: 'quick', expectedTurn: 1 }),
      request(app)
        .post(`/api/battle/pve/${started.body.id}/action`)
        .set('Authorization', authorization(otherUserId))
        .send({ moveId: 'quick', expectedTurn: 1 }),
      request(app)
        .post('/api/battle/pve/missing-session/abandon')
        .set('Authorization', authorization(userId))
        .send({}),
      request(app)
        .post(`/api/battle/pve/${started.body.id}/abandon`)
        .set('Authorization', authorization(otherUserId))
        .send({}),
    ];

    const responses = await Promise.all(cases);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Battle session not found.' });
    }
  });

  it('persists terminal progression exactly once and matches the public response', async () => {
    const started = await startBattle();
    let session = started.body;

    for (let attempt = 0; attempt < 5 && session.status === 'active'; attempt += 1) {
      const action = await request(app)
        .post(`/api/battle/pve/${session.id}/action`)
        .set('Authorization', authorization(userId))
        .send({ moveId: 'quick', expectedTurn: session.turnNumber });
      expect(action.status).toBe(200);
      expect(action.body.stale).toBe(false);
      expectPublicSession(action.body.session);
      session = action.body.session;
    }

    expect(session).toMatchObject({
      status: 'won',
      xpAwarded: 20,
    });
    expect((await readRawSession(session.id))!.rewardApplied).toBe(true);
    const profile = (
      await getDb().collection('users').doc(userId).get()
    ).data()!;
    expect(profile).toMatchObject({
      pveXp: session.xpAwarded,
      pveWins: 1,
      pveLosses: 0,
      currentPveWinStreak: 1,
      bestPveWinStreak: 1,
    });

    const terminalRetry = await request(app)
      .post(`/api/battle/pve/${session.id}/action`)
      .set('Authorization', authorization(userId))
      .send({ moveId: 'quick', expectedTurn: session.turnNumber });
    expect(terminalRetry.status).toBe(409);
    const profileAfterRetry = (
      await getDb().collection('users').doc(userId).get()
    ).data()!;
    expect(profileAfterRetry).toEqual(profile);
  });

  it('maps a missing terminal reward profile to a stable error without partial state', async () => {
    const started = await startBattle();
    await getDb().collection('users').doc(userId).delete();
    let lastPersistedSession = started.body;
    let failed: Response | undefined;

    for (let attempt = 0; attempt < 5 && failed === undefined; attempt += 1) {
      const response = await request(app)
        .post(`/api/battle/pve/${started.body.id}/action`)
        .set('Authorization', authorization(userId))
        .send({
          moveId: 'quick',
          expectedTurn: lastPersistedSession.turnNumber,
        });
      if (response.status === 409) failed = response;
      else {
        expect(response.status).toBe(200);
        lastPersistedSession = response.body.session;
      }
    }

    expect(failed).toBeDefined();
    expect(failed!.status).toBe(409);
    expect(failed!.body).toEqual({ error: 'Battle profile is unavailable.' });
    expect(JSON.stringify(failed!.body)).not.toMatch(
      /firestore|transaction|profile_missing/i
    );
    const persisted = await request(app)
      .get(`/api/battle/pve/${started.body.id}`)
      .set('Authorization', authorization(userId));
    expect(persisted.body).toEqual(lastPersistedSession);
  });

  it('does not expose raw avatar repository failures', async () => {
    const avatarId = 'malformed-owned-avatar';
    await getDb().collection('avatar_records').doc(avatarId).set({
      userId,
      speciesName: 'Broken',
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await startBattle(userId, avatarId);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error.' });
      expect(JSON.stringify(response.body)).not.toMatch(/firestore|avatar_records|stats/i);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('does not expose raw battle repository decoder failures', async () => {
    const started = await startBattle();
    await getDb()
      .collection('battle_sessions')
      .doc(started.body.id)
      .set({ pendingBotMoveId: 'secret-invalid-move' }, { merge: true });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await request(app)
        .get(`/api/battle/pve/${started.body.id}`)
        .set('Authorization', authorization(userId));

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error.' });
      expect(JSON.stringify(response.body)).not.toMatch(
        /firestore|battle_sessions|secret-invalid-move|pendingBotMoveId/i
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('uses injectable start entropy and maps a repository ID collision', async () => {
    const avatarId = await seedAvatar({
      displayName: 'Display Sun',
      speciesName: 'Helianthus annuus',
      speciesFamily: 'Asteraceae',
    });
    const service = createBattleService({
      avatarRepository,
      battleRepository,
      clock: () => new Date('2026-07-23T02:00:00.000Z'),
      generateSeed: () => 0xffff_ffff,
      generateSessionId: () => 'fixed-collision-session',
    });

    const created = await service.startPveBattle(userId, avatarId);

    expect(created).toMatchObject({
      id: 'fixed-collision-session',
      rngSeed: 0xffff_ffff,
      rngStep: 1,
      player: {
        name: 'Display Sun',
        moves: expect.arrayContaining([
          expect.objectContaining({ id: 'signature', name: 'Solar Bloom' }),
        ]),
      },
    });
    expect(
      created.log.filter((event) => event.type === 'bot_intent_prepared')
    ).toHaveLength(1);
    await expect(service.startPveBattle(userId, avatarId)).rejects.toMatchObject({
      code: 'battle_already_exists',
      status: 409,
      message: 'Battle session already exists.',
    });
    expect((await readRawSession(created.id))!.rngStep).toBe(1);
  });

  it('counts only accepted action attempts and isolates each user rate-limit key', async () => {
    expect(PRODUCTION_BATTLE_ACTION_LIMIT_MAX).toBe(60);
    const firstStarted = await startBattle();
    const secondAvatarId = await seedAvatar({
      id: 'other-user-avatar',
      ownerId: otherUserId,
    });
    const secondStarted = await startBattle(otherUserId, secondAvatarId);
    const rateLimitedApp = createRateLimitedBattleApp(2);

    for (const invalidBody of [
      {},
      { moveId: '', expectedTurn: 1 },
      { moveId: 'quick', expectedTurn: '1' },
    ]) {
      const invalid = await request(rateLimitedApp)
        .post(`/api/battle/pve/${firstStarted.body.id}/action`)
        .set('Authorization', authorization(userId))
        .send(invalidBody);
      expect(invalid.status).toBe(400);
      expect(invalid.headers).not.toHaveProperty('ratelimit-limit');
    }

    const firstUserResponses: Response[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      firstUserResponses.push(
        await request(rateLimitedApp)
          .post(`/api/battle/pve/${firstStarted.body.id}/action`)
          .set('Authorization', authorization(userId))
          .send({ moveId: 'quick', expectedTurn: 1 })
      );
    }
    expect(firstUserResponses.map((response) => response.status)).toEqual([
      200,
      200,
      429,
    ]);
    expect(firstUserResponses[0].headers).toMatchObject({
      'ratelimit-limit': '2',
      'ratelimit-remaining': '1',
    });
    expect(firstUserResponses[0].headers).toHaveProperty('ratelimit-policy');
    expect(firstUserResponses[0].headers).not.toHaveProperty('x-ratelimit-limit');
    expect(firstUserResponses[2].body).toEqual({
      error: 'Too many battle actions. Please try again later.',
    });

    const secondUserResponses: Response[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      secondUserResponses.push(
        await request(rateLimitedApp)
          .post(`/api/battle/pve/${secondStarted.body.id}/action`)
          .set('Authorization', authorization(otherUserId))
          .send({ moveId: 'quick', expectedTurn: 1 })
      );
    }
    expect(secondUserResponses.map((response) => response.status)).toEqual([
      200,
      200,
      429,
    ]);
  });
});
