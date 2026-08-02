import request from 'supertest';
import { ALMANAC_SPECIES, almanacIdForSpecies, findAlmanacSpecies } from '../data/almanac';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const FINDER_ID = 'almanac-finder';
const SPRITE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PHOTO_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';
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

async function saveScan(
  speciesName: string,
  userId = FINDER_ID,
  withPhoto = true
): Promise<request.Response> {
  return request(app)
    .post('/api/avatar')
    .set('Authorization', authorization(userId))
    .send({
      speciesName,
      speciesFamily: 'Gentianaceae',
      spriteDataUrl: SPRITE_DATA_URL,
      ...(withPhoto ? { photoDataUrl: PHOTO_DATA_URL } : {}),
      source: 'mobile',
      metadata: {
        taxonomy: { Family: 'Gentianaceae', Genus: 'Fagraea' },
        commonNames: ['Tembusu'],
        description: 'A large evergreen tree with fragrant cream flowers.',
        confidence: 0.94,
      },
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
    await saveScan(TEMBUSU);

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
    // The privacy line: no finder, no date, no photograph, anywhere in the body.
    expect(tembusu).not.toHaveProperty('discoveredByName');
    expect(tembusu).not.toHaveProperty('photoUrl');
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('NatTheBotanist');
    expect(body).not.toContain(FINDER_ID);
    expect(body).not.toContain('data:image/jpeg');
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
  // for anybody, with no login and nothing about the player who found it.
  it('gives an anonymous caller the sprite, stats and botanical record', async () => {
    await seedProfile(FINDER_ID, 'NatTheBotanist');
    await saveScan(TEMBUSU);

    const response = await request(app).get('/api/almanac/fagraea-fragrans');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      speciesName: TEMBUSU,
      discovered: true,
      spriteUrl: SPRITE_DATA_URL,
      description: 'A large evergreen tree with fragrant cream flowers.',
      commonNames: ['Tembusu'],
      taxonomy: { Family: 'Gentianaceae', Genus: 'Fagraea' },
      confidence: 0.94,
    });
    expect(response.body.stats).toMatchObject({
      hp: expect.any(Number),
      attack: expect.any(Number),
      defense: expect.any(Number),
      speed: expect.any(Number),
    });

    // The person stays behind the login even though the plant does not.
    expect(response.body.discoveredByName).toBeUndefined();
    expect(response.body.photoUrl).toBeUndefined();
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('NatTheBotanist');
    expect(body).not.toContain(FINDER_ID);
    expect(body).not.toContain('data:image/jpeg');
  });

  it('adds the finder, the date and the photo once signed in', async () => {
    await seedProfile(FINDER_ID, 'NatTheBotanist');
    await saveScan(TEMBUSU);

    const signedIn = await request(app)
      .get('/api/almanac/fagraea-fragrans')
      .set('Authorization', authorization('some-other-player'));

    expect(signedIn.status).toBe(200);
    expect(signedIn.body).toMatchObject({
      speciesName: TEMBUSU,
      discovered: true,
      discoveredByName: 'NatTheBotanist',
      photoUrl: PHOTO_DATA_URL,
    });
    expect(Date.parse(signedIn.body.discoveredAt)).not.toBeNaN();
  });

  it('answers 404 for a species outside the taxonomy', async () => {
    const response = await request(app).get('/api/almanac/monstera-deliciosa');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Species not found.' });
  });
});

describe('recording a discovery', () => {
  it('credits the first finder and only counts the rest', async () => {
    await seedProfile(FINDER_ID, 'FirstFinder');
    await seedProfile('almanac-second', 'SecondFinder');

    const first = await saveScan(TEMBUSU);
    const second = await saveScan(TEMBUSU, 'almanac-second');

    expect(first.body.almanac).toEqual({
      speciesId: 'fagraea-fragrans',
      commonName: 'Tembusu',
      firstDiscovery: true,
    });
    expect(second.body.almanac).toMatchObject({ firstDiscovery: false });

    const entry = await request(app)
      .get('/api/almanac/fagraea-fragrans')
      .set('Authorization', authorization());
    expect(entry.body).toMatchObject({
      discoveredByName: 'FirstFinder',
      discoveryCount: 2,
    });
  });

  it('saves an off-taxonomy scan without claiming it is a discovery', async () => {
    await seedProfile(FINDER_ID, 'FirstFinder');

    const saved = await saveScan('Monstera deliciosa');

    expect(saved.status).toBe(201);
    expect(saved.body.almanac).toBeNull();
    const almanac = await request(app).get('/api/almanac');
    expect(almanac.body.discovered).toBe(0);
  });

  // The uid is the finder's identity; the display name is a snapshot taken at
  // discovery time so a later rename cannot rewrite who found what.
  it('keeps the credit when the finder renames themselves', async () => {
    await seedProfile(FINDER_ID, 'OriginalName');
    await saveScan(TEMBUSU);
    await getDb().collection('users').doc(FINDER_ID).update({ displayName: 'NewName' });

    const entry = await request(app)
      .get('/api/almanac/fagraea-fragrans')
      .set('Authorization', authorization());
    expect(entry.body.discoveredByName).toBe('OriginalName');
  });
});
