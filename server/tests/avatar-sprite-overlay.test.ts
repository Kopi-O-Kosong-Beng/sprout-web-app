/**
 * The archive shows the currently-published dex sprite, resolved on read.
 *
 * When a superadmin publishes a different candidate in the dex gate, the global
 * reference moves but players' stored records do not. Rather than rewrite every
 * owner's records on publish, GET /api/avatar overlays the live dex sprite for
 * each record's species — so visiting the archive reflects the publish.
 */
import request from 'supertest';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const OWNER = 'overlay-owner';
let previousAuthDevBypass: string | undefined;

const BUCKET = 'sprout-test.firebasestorage.app';
/** A canonical stored-sprite url, the shape sprite-storage produces. */
const spriteUrl = (key: string, version = 1, token = 't') =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/sprites%2F${key}%2Fv${version}.png?alt=media&token=${token}`;

async function seedAvatar(id: string, storedSpriteUrl: string, speciesName: string): Promise<void> {
  await getDb().collection('avatar_records').doc(id).set({
    userId: OWNER,
    speciesName,
    speciesFamily: 'Testaceae',
    spriteUrl: storedSpriteUrl,
    discoveredAt: '2026-07-20T00:00:00.000Z',
    source: 'mobile',
    isTemporary: false,
    expiresAt: null,
    stats: { hp: 100, attack: 52, defense: 61, speed: 48 },
    metadata: { displayName: speciesName },
  });
}

async function seedDexSprite(speciesKey: string, publishedSpriteUrl: string): Promise<void> {
  await getDb().collection('dex').doc(speciesKey).set({
    speciesKey,
    speciesName: speciesKey,
    firstDiscoveredBy: 'someone',
    firstDiscoveredAt: '2026-07-01T00:00:00.000Z',
    discoveryCount: 1,
    spriteUrl: publishedSpriteUrl,
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

const authorization = `Bearer verified:${OWNER}`;

describe('archive sprite overlay', () => {
  it('returns the currently-published dex sprite, not the stored one', async () => {
    // The record was scanned when v1 was canonical; the gate has since
    // published v2 as the global reference.
    await seedAvatar('a1', spriteUrl('test_fern', 1), 'Test Fern');
    await seedDexSprite('test_fern', spriteUrl('test_fern', 2, 'published'));

    const res = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization);

    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === 'a1');
    expect(item.spriteUrl).toBe(spriteUrl('test_fern', 2, 'published'));
  });

  it('leaves a record whose species has no dex entry untouched', async () => {
    const stored = spriteUrl('lonely_species', 1);
    await seedAvatar('a2', stored, 'Lonely Species');

    const res = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization);

    const item = res.body.items.find((i: { id: string }) => i.id === 'a2');
    expect(item.spriteUrl).toBe(stored);
  });

  it('leaves a non-storage sprite (seeded demo asset) untouched', async () => {
    // A /plants/ asset is not a stored object, so no key can be parsed from it
    // and a same-named dex entry must not hijack it.
    await seedAvatar('a3', '/plants/SPRITE_Demo.png', 'test_fern');
    await seedDexSprite('test_fern', spriteUrl('test_fern', 2, 'published'));

    const res = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization);

    const item = res.body.items.find((i: { id: string }) => i.id === 'a3');
    expect(item.spriteUrl).toBe('/plants/SPRITE_Demo.png');
  });

  it('overlays the detail endpoint too', async () => {
    await seedAvatar('a4', spriteUrl('test_rose', 1), 'Test Rose');
    await seedDexSprite('test_rose', spriteUrl('test_rose', 3, 'published'));

    const res = await request(app)
      .get('/api/avatar/a4')
      .set('Authorization', authorization);

    expect(res.status).toBe(200);
    expect(res.body.spriteUrl).toBe(spriteUrl('test_rose', 3, 'published'));
  });
});
