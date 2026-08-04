/**
 * Leaderboard API.
 *
 * Two boards off data the app already keeps: PVE experience, which the battle
 * repository accumulates on the profile at the end of every match, and species
 * discovery, which is a count of the `dex` records naming a player as the first
 * finder. Nothing here introduces a new write path — a leaderboard that had its
 * own tally would be a second answer to a question already answered.
 *
 * Authenticated, unlike the almanac grid. Every row is a display name attached
 * to a play record, which is exactly what the almanac's public view withholds
 * from anonymous visitors; publishing the same names on a ranked table would
 * undo that decision.
 */
import request from 'supertest';
import { getDb } from '../firebase';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

let previousAuthDevBypass: string | undefined;

function authorization(userId: string): string {
  return `Bearer verified:${userId}`;
}

async function seedPlayer(
  userId: string,
  displayName: string,
  progression: {
    pveXp?: number;
    pveWins?: number;
    pveLosses?: number;
    bestPveWinStreak?: number;
  } = {}
): Promise<void> {
  await getDb()
    .collection('users')
    .doc(userId)
    .set({
      email: `${userId}@example.com`,
      displayName,
      isVerified: true,
      passwordHash: 'x',
      pveXp: progression.pveXp ?? 0,
      pveWins: progression.pveWins ?? 0,
      pveLosses: progression.pveLosses ?? 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: progression.bestPveWinStreak ?? 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    });
}

async function seedDiscovery(speciesName: string, userId: string): Promise<void> {
  const speciesKey = sanitizeSpeciesKey(speciesName);
  await getDb().collection('dex').doc(speciesKey).set({
    speciesKey,
    speciesName,
    firstDiscoveredBy: userId,
    firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
    discoveryCount: 1,
    spriteUrl: '',
  });
}

beforeAll(() => {
  previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
  process.env.AUTH_DEV_BYPASS = 'false';
});

afterAll(() => {
  if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
  else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
});

beforeEach(async () => {
  await clearFirestore();
  mockAuthAdmin.verifyIdToken.mockReset();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    if (!token.startsWith('verified:')) throw new Error('invalid token');
    return { uid: token.slice('verified:'.length), email_verified: true };
  });
});

describe('GET /api/leaderboard', () => {
  it('rejects an unauthenticated caller', async () => {
    const response = await request(app).get('/api/leaderboard');
    expect(response.status).toBe(401);
  });

  it('ranks players by PVE experience, highest first', async () => {
    await seedPlayer('u-low', 'Low Scorer', { pveXp: 20, pveWins: 1 });
    await seedPlayer('u-high', 'High Scorer', { pveXp: 140, pveWins: 7 });
    await seedPlayer('u-mid', 'Mid Scorer', { pveXp: 65, pveWins: 3 });

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('u-mid'));

    expect(response.status).toBe(200);
    expect(response.body.xp.entries.map((e: { displayName: string }) => e.displayName)).toEqual([
      'High Scorer',
      'Mid Scorer',
      'Low Scorer',
    ]);
    expect(response.body.xp.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 3]);
  });

  it('reports the caller their own rank even when outside the top slice', async () => {
    for (let index = 0; index < 12; index += 1) {
      await seedPlayer(`u-${index}`, `Player ${index}`, { pveXp: 500 - index * 10 });
    }
    await seedPlayer('u-caller', 'The Caller', { pveXp: 5 });

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('u-caller'));

    expect(response.status).toBe(200);
    expect(response.body.xp.entries).toHaveLength(10);
    // Rows carry `isCaller` rather than a uid: the client only needs to know
    // which row is yours, and the almanac already established that other
    // players' identifiers do not leave the server.
    expect(
      response.body.xp.entries.some((e: { isCaller: boolean }) => e.isCaller)
    ).toBe(false);
    expect(response.body.xp.caller).toEqual(
      expect.objectContaining({ rank: 13, xp: 5, displayName: 'The Caller' })
    );
  });

  it('gives tied players the same rank', async () => {
    await seedPlayer('u-a', 'Alpha', { pveXp: 100 });
    await seedPlayer('u-b', 'Bravo', { pveXp: 100 });
    await seedPlayer('u-c', 'Charlie', { pveXp: 40 });

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('u-a'));

    const ranks = response.body.xp.entries.map(
      (e: { displayName: string; rank: number }) => [e.displayName, e.rank]
    );
    expect(ranks).toEqual([
      ['Alpha', 1],
      ['Bravo', 1],
      ['Charlie', 3],
    ]);
  });

  it('ranks discovery by how many species a player found first', async () => {
    await seedPlayer('u-finder', 'Finder', { pveXp: 0 });
    await seedPlayer('u-rival', 'Rival', { pveXp: 999 });
    await seedDiscovery('Fagraea fragrans', 'u-finder');
    await seedDiscovery('Monstera deliciosa', 'u-finder');
    await seedDiscovery('Helianthus annuus', 'u-rival');

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('u-finder'));

    expect(response.status).toBe(200);
    expect(response.body.discovery.entries).toEqual([
      expect.objectContaining({ displayName: 'Finder', discoveries: 2, rank: 1 }),
      expect.objectContaining({ displayName: 'Rival', discoveries: 1, rank: 2 }),
    ]);
  });

  it('omits players who have discovered nothing from the discovery board', async () => {
    await seedPlayer('u-finder', 'Finder', { pveXp: 10 });
    await seedPlayer('u-idle', 'Idle', { pveXp: 10 });
    await seedDiscovery('Fagraea fragrans', 'u-finder');

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('u-idle'));

    expect(
      response.body.discovery.entries.map((e: { displayName: string }) => e.displayName)
    ).toEqual(['Finder']);
    expect(response.body.discovery.caller).toEqual(
      expect.objectContaining({ discoveries: 0, rank: null })
    );
  });

  it('never exposes an email or a uid belonging to another player', async () => {
    await seedPlayer('u-other', 'Other Player', { pveXp: 300 });
    await seedPlayer('u-caller', 'The Caller', { pveXp: 10 });
    await seedDiscovery('Fagraea fragrans', 'u-other');

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('u-caller'));

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('u-other@example.com');
    expect(body).not.toContain('"u-other"');
  });
});

/**
 * The XP board used to list the whole user collection, so every account that
 * registered and never battled sat on it at 0 XP — padding the board and
 * turning totalPlayers into a signup count. The discovery board has always
 * excluded them; this makes the two agree.
 */
describe('XP board membership', () => {
  it('leaves out accounts that have never battled', async () => {
    await seedPlayer('xp-active', 'Active', { pveXp: 40, pveWins: 2, pveLosses: 1 });
    await seedPlayer('xp-idle-a', 'Idle A', { pveXp: 0, pveWins: 0, pveLosses: 0 });
    await seedPlayer('xp-idle-b', 'Idle B', { pveXp: 0, pveWins: 0, pveLosses: 0 });

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('xp-active'));

    expect(response.status).toBe(200);
    const names = response.body.xp.entries.map((e: { displayName: string }) => e.displayName);
    expect(names).toEqual(['Active']);
    expect(response.body.xp.totalPlayers).toBe(1);
  });

  it('keeps a player who has only ever lost', async () => {
    // 0 XP but they turned up — that is a player, not an empty signup.
    await seedPlayer('xp-loser', 'Loser', { pveXp: 0, pveWins: 0, pveLosses: 3 });

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('xp-loser'));

    const names = response.body.xp.entries.map((e: { displayName: string }) => e.displayName);
    expect(names).toContain('Loser');
  });

  it('still gives an unbattled caller their own unranked row', async () => {
    await seedPlayer('xp-active', 'Active', { pveXp: 40, pveWins: 2, pveLosses: 1 });
    await seedPlayer('xp-newbie', 'Newbie', { pveXp: 0, pveWins: 0, pveLosses: 0 });

    const response = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', authorization('xp-newbie'));

    expect(response.body.xp.caller).toMatchObject({
      displayName: 'Newbie',
      xp: 0,
      rank: null,
    });
    expect(
      response.body.xp.entries.map((e: { displayName: string }) => e.displayName)
    ).not.toContain('Newbie');
  });
});
