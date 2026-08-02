import request from 'supertest';
import { ALMANAC_SPECIES, almanacIdForSpecies, findAlmanacSpecies } from '../data/almanac';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import { deriveSpeciesStats } from '../data/species-stats';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const FINDER_ID = 'almanac-finder';
/** Sprite storage is canonical per species; the dex records the URL it wrote. */
const SPRITE_URL = 'https://cdn.test/sprites/fagraea_fragrans/v1.png';
/** A species the checklist selection is guaranteed to contain. */
const TEMBUSU = 'Fagraea fragrans';

let previousAuthDevBypass: string | undefined;

function authorization(userId = FINDER_ID): string {
  return `Bearer verified:${userId}`;
}

async function seedProfile(userId: string, displayName: string): Promise<void> {
  await getDb().collection('users').doc(userId).set({
    email: `${userId}@example.com`,
    displayName,
    isVerified: true,
    passwordHash: 'x',
    createdAt: '2026-08-01T00:00:00.000Z',
  });
}

async function seedDiscovery(
  speciesName: string,
  userId = FINDER_ID,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  const speciesKey = sanitizeSpeciesKey(speciesName);
  await getDb()
    .collection('dex')
    .doc(speciesKey)
    .set({
      speciesKey,
      speciesName,
      firstDiscoveredBy: userId,
      firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
      discoveryCount: 1,
      spriteUrl: SPRITE_URL,
      ...overrides,
    });
}

beforeEach(async () => {
  previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
  process.env.AUTH_DEV_BYPASS = 'false';
  mockAuthAdmin.verifyIdToken.mockReset();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    const [kind, uid] = token.split(':');
    if (kind !== 'verified' || !uid) throw new Error('invalid test token');
    return { uid, email: `${uid}@example.com`, email_verified: true };
  });
  await clearFirestore();
});

afterEach(() => {
  if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
  else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
});

describe('almanac taxonomy', () => {
  it('lists 200 flowering plants with stable ids', () => {
    expect(ALMANAC_SPECIES).toHaveLength(200);
    const ids = ALMANAC_SPECIES.map((species) => species.id);
    expect(new Set(ids).size).toBe(200);
    for (const species of ALMANAC_SPECIES) {
      expect(species.id).toBe(almanacIdForSpecies(species.speciesName));
      expect(species.family).toMatch(/aceae$/);
      expect(['common', 'naturalised', 'casual']).toContain(species.status);
    }
  });

  // Identifications arrive with authorities and subspecies attached, and the
  // pipeline's own fallback is the string "Unknown Plant Species".
  it.each([
    ['Fagraea fragrans Roxb.', 'fagraea-fragrans'],
    ['  fagraea   fragrans  ', 'fagraea-fragrans'],
    ['Avicennia marina (Forsk.) Vierh. ssp. marina', 'avicennia-marina'],
  ])('keys %s on its binomial', (identified, expected) => {
    expect(almanacIdForSpecies(identified)).toBe(expected);
  });

  it.each(['Unknown Plant Species', 'Rose', '', '12345'])(
    'refuses to key %p',
    (identified) => {
      expect(findAlmanacSpecies(identified)).toBeNull();
    }
  );
});

describe('public almanac', () => {
  it('is readable without a login and names nobody', async () => {
    await seedProfile(FINDER_ID, 'NatTheBotanist');
    await seedDiscovery(TEMBUSU);

    const response = await request(app).get('/api/almanac');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(200);
    expect(response.body.discovered).toBe(1);

    const tembusu = response.body.species.find(
      (entry: { id: string }) => entry.id === 'fagraea-fragrans'
    );
    expect(tembusu).toMatchObject({
      speciesName: TEMBUSU,
      commonName: 'Tembusu',
      discovered: true,
      discoveryCount: 1,
    });
    // The privacy line: no finder, no uid, anywhere in the body.
    expect(tembusu).not.toHaveProperty('discoveredByName');
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('NatTheBotanist');
    expect(body).not.toContain(FINDER_ID);
  });

  it('shows undiscovered species as undiscovered', async () => {
    const response = await request(app).get('/api/almanac');

    expect(response.status).toBe(200);
    expect(response.body.discovered).toBe(0);
    expect(
      response.body.species.every((entry: { discovered: boolean }) => !entry.discovered)
    ).toBe(true);
  });

  // The card the landing page opens: the species and what the game made of it,
  // for anybody, with nothing about the player who found it.
  it('gives an anonymous caller the sprite and stats', async () => {
    await seedProfile(FINDER_ID, 'NatTheBotanist');
    await seedDiscovery(TEMBUSU);

    const response = await request(app).get('/api/almanac/fagraea-fragrans');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      speciesName: TEMBUSU,
      discovered: true,
      spriteUrl: SPRITE_URL,
    });
    // Stats are derived from the species key, so they match the archive's.
    expect(response.body.stats).toEqual(
      deriveSpeciesStats(sanitizeSpeciesKey(TEMBUSU))
    );
    expect(response.body.discoveredByName).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('NatTheBotanist');
  });

  it('adds the finder and the date once signed in', async () => {
    await seedProfile(FINDER_ID, 'NatTheBotanist');
    await seedDiscovery(TEMBUSU);

    const signedIn = await request(app)
      .get('/api/almanac/fagraea-fragrans')
      .set('Authorization', authorization('some-other-player'));

    expect(signedIn.status).toBe(200);
    expect(signedIn.body).toMatchObject({
      discoveredByName: 'NatTheBotanist',
      isFirstDiscoverer: false,
    });
    expect(Date.parse(signedIn.body.discoveredAt)).not.toBeNaN();
  });

  it('tells the first discoverer that it was them', async () => {
    await seedProfile(FINDER_ID, 'NatTheBotanist');
    await seedDiscovery(TEMBUSU);

    const response = await request(app)
      .get('/api/almanac/fagraea-fragrans')
      .set('Authorization', authorization(FINDER_ID));

    expect(response.body.isFirstDiscoverer).toBe(true);
  });

  it('answers 404 for a species outside the taxonomy', async () => {
    const response = await request(app).get('/api/almanac/monstera-deliciosa');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Species not found.' });
  });

  // Anything scanned that the 200 does not carry is the signal to extend it.
  it('surfaces an off-taxonomy discovery to admins only', async () => {
    await seedDiscovery('Monstera deliciosa', FINDER_ID, { discoveryCount: 3 });

    const almanac = await request(app).get('/api/almanac');
    expect(almanac.body.discovered).toBe(0);
  });
});
