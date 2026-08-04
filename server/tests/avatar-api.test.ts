import request from 'supertest';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';
import { deriveAvatarStats } from '../services/avatar-stats';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const OWNER_ID = 'avatar-api-owner';
const FOREIGN_ID = 'avatar-api-foreign';
let previousAuthDevBypass: string | undefined;

interface SeedAvatarOptions {
  id: string;
  userId?: string;
  speciesName?: string;
  discoveredAt?: string;
  isTemporary?: boolean;
  expiresAt?: string | null;
}

function authorization(userId = OWNER_ID): string {
  return `Bearer verified:${userId}`;
}

async function seedAvatar(options: SeedAvatarOptions): Promise<void> {
  await getDb().collection('avatar_records').doc(options.id).set({
    userId: options.userId ?? OWNER_ID,
    speciesName: options.speciesName ?? 'Archive Fern',
    speciesFamily: 'Polypodiaceae',
    spriteUrl: `/static/sprites/${options.id}.png`,
    discoveredAt: options.discoveredAt ?? '2026-07-20T00:00:00.000Z',
    source: 'mobile',
    isTemporary: options.isTemporary ?? false,
    expiresAt: options.expiresAt ?? null,
    stats: { hp: 100, attack: 52, defense: 61, speed: 48 },
    metadata: { displayName: options.speciesName ?? 'Archive Fern' },
  });
}

beforeEach(async () => {
  previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
  process.env.AUTH_DEV_BYPASS = 'false';
  mockAuthAdmin.verifyIdToken.mockReset();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    const [kind, uid] = token.split(':');
    if (kind !== 'verified' || !uid) throw new Error('invalid test token');
    return {
      uid,
      email: `${uid}@example.com`,
      email_verified: true,
    };
  });
  await clearFirestore();
});

afterEach(() => {
  if (previousAuthDevBypass === undefined) {
    delete process.env.AUTH_DEV_BYPASS;
  } else {
    process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
  }
});

describe('verified avatar archive API', () => {
  it('returns an empty first page for a verified new user', async () => {
    const response = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(mockAuthAdmin.verifyIdToken).toHaveBeenCalledWith(
      `verified:${OWNER_ID}`
    );
  });

  it('returns 401 without authentication and does not expose archive data', async () => {
    await seedAvatar({
      id: 'private-owned-avatar',
      speciesName: 'Private Archive Fern',
    });

    const response = await request(app).get('/api/avatar');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorised.' });
    expect(JSON.stringify(response.body)).not.toContain('Private Archive Fern');
    expect(mockAuthAdmin.verifyIdToken).not.toHaveBeenCalled();
  });

  it('lists only caller-owned avatars with bounded page and pageSize values', async () => {
    await Promise.all([
      seedAvatar({
        id: 'owner-oldest',
        speciesName: 'Oldest Fern',
        discoveredAt: '2026-07-20T00:00:00.000Z',
      }),
      seedAvatar({
        id: 'owner-middle',
        speciesName: 'Middle Fern',
        discoveredAt: '2026-07-21T00:00:00.000Z',
      }),
      seedAvatar({
        id: 'owner-newest',
        speciesName: 'Newest Fern',
        discoveredAt: '2026-07-22T00:00:00.000Z',
      }),
      seedAvatar({
        id: 'foreign-newest',
        userId: FOREIGN_ID,
        speciesName: 'Foreign Fern',
        discoveredAt: '2026-07-23T00:00:00.000Z',
      }),
    ]);

    const minimums = await request(app)
      .get('/api/avatar?page=-4&pageSize=-8')
      .set('Authorization', authorization());
    const secondPage = await request(app)
      .get('/api/avatar?page=2&pageSize=1')
      .set('Authorization', authorization());
    const finalPartialPage = await request(app)
      .get('/api/avatar?page=2&pageSize=2')
      .set('Authorization', authorization());
    const beyondFinalPage = await request(app)
      .get('/api/avatar?page=3&pageSize=2')
      .set('Authorization', authorization());
    const maximumPageSize = await request(app)
      .get('/api/avatar?page=1&pageSize=101')
      .set('Authorization', authorization());

    expect(minimums.status).toBe(200);
    expect(minimums.body).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 3,
      items: [{ id: 'owner-newest', userId: OWNER_ID }],
    });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 3,
      items: [{ id: 'owner-middle', userId: OWNER_ID }],
    });
    expect(finalPartialPage.status).toBe(200);
    expect(finalPartialPage.body).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      items: [{ id: 'owner-oldest', userId: OWNER_ID }],
    });
    expect(beyondFinalPage.status).toBe(200);
    expect(beyondFinalPage.body).toEqual({
      items: [],
      page: 3,
      pageSize: 2,
      total: 3,
    });
    expect(maximumPageSize.status).toBe(200);
    expect(maximumPageSize.body).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 3,
    });
    expect(
      maximumPageSize.body.items.map((item: { id: string }) => item.id)
    ).toEqual(['owner-newest', 'owner-middle', 'owner-oldest']);
    expect(JSON.stringify(maximumPageSize.body)).not.toContain('Foreign Fern');
  });

  it('returns a caller-owned avatar detail from the public route', async () => {
    await seedAvatar({
      id: 'owned-detail',
      speciesName: 'Detail Fern',
      discoveredAt: '2026-07-22T04:00:00.000Z',
    });

    const response = await request(app)
      .get('/api/avatar/owned-detail')
      .set('Authorization', authorization());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'owned-detail',
      userId: OWNER_ID,
      speciesName: 'Detail Fern',
      speciesFamily: 'Polypodiaceae',
      spriteUrl: '/static/sprites/owned-detail.png',
      discoveredAt: '2026-07-22T04:00:00.000Z',
      source: 'mobile',
      isTemporary: false,
      expiresAt: null,
      battleEligible: true,
      stats: { hp: 100, attack: 52, defense: 61, speed: 48 },
      metadata: { displayName: 'Detail Fern' },
    });
  });

  it('serializes server-authoritative battle eligibility on list and detail', async () => {
    await Promise.all([
      seedAvatar({
        id: 'eligible-future',
        speciesName: 'Future Fern',
        isTemporary: true,
        expiresAt: '2999-01-01T00:00:00.000Z',
      }),
      seedAvatar({
        id: 'ineligible-expired',
        speciesName: 'Expired Fern',
        isTemporary: true,
        expiresAt: '2020-01-01T00:00:00.000Z',
      }),
    ]);

    const list = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization());
    const detail = await request(app)
      .get('/api/avatar/ineligible-expired')
      .set('Authorization', authorization());

    expect(list.status).toBe(200);
    expect(
      Object.fromEntries(
        list.body.items.map(
          (item: { id: string; battleEligible: boolean }) => [
            item.id,
            item.battleEligible,
          ]
        )
      )
    ).toEqual({
      'eligible-future': true,
      'ineligible-expired': false,
    });
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: 'ineligible-expired',
      battleEligible: false,
    });
  });

  it('returns the same 404 response for missing and foreign avatar details', async () => {
    await seedAvatar({
      id: 'foreign-detail',
      userId: FOREIGN_ID,
      speciesName: 'Private Foreign Fern',
    });

    const missing = await request(app)
      .get('/api/avatar/missing-detail')
      .set('Authorization', authorization());
    const foreign = await request(app)
      .get('/api/avatar/foreign-detail')
      .set('Authorization', authorization());

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Avatar not found.' });
    expect(foreign.body).toEqual(missing.body);
    expect(JSON.stringify(foreign.body)).not.toContain('Private Foreign Fern');
  });
});

describe('saving a scanned avatar', () => {
  // A real sprite is a 192x192 Spica72 PNG; a 1x1 stands in for the bytes,
  // since nothing on this path decodes the image.
  const SPRITE_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const PHOTO_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';

  function scanBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      speciesName: 'Monstera deliciosa',
      speciesFamily: 'Araceae',
      spriteDataUrl: SPRITE_DATA_URL,
      source: 'mobile',
      metadata: {
        taxonomy: { Family: 'Araceae' },
        commonNames: ['Swiss cheese plant'],
        confidence: 0.91,
      },
      ...overrides,
    };
  }

  it('keeps an IRL scan for good and lists it in the caller archive', async () => {
    const created = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(scanBody());

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      userId: OWNER_ID,
      speciesName: 'Monstera deliciosa',
      speciesFamily: 'Araceae',
      spriteUrl: SPRITE_DATA_URL,
      source: 'mobile',
      isTemporary: false,
      expiresAt: null,
      battleEligible: true,
      stats: deriveAvatarStats('Monstera deliciosa', 'Araceae'),
      metadata: {
        displayName: 'Monstera deliciosa',
        capturedVia: 'scan',
        confidence: 0.91,
      },
    });
    expect(created.body.id).toEqual(expect.any(String));

    const list = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization());
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(created.body.id);

    const foreign = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization(FOREIGN_ID));
    expect(foreign.body.items).toEqual([]);
  });

  it('makes a web upload a 24h TempAvatar (Req 6.12)', async () => {
    const created = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(scanBody({ source: 'web' }));

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ source: 'web', isTemporary: true });
    const ttlMs =
      Date.parse(created.body.expiresAt) - Date.parse(created.body.discoveredAt);
    expect(ttlMs).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps the photograph beside the sprite when the scan sends one', async () => {
    const created = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(scanBody({ photoDataUrl: PHOTO_DATA_URL }));

    expect(created.status).toBe(201);
    expect(created.body.metadata.photoUrl).toBe(PHOTO_DATA_URL);
  });

  it('rejects a photograph that is not a JPEG data URL', async () => {
    const response = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(scanBody({ photoDataUrl: SPRITE_DATA_URL }));

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(
      'photoDataUrl must be a base64 JPEG data URL.'
    );
  });

  it.each([['omitted', undefined], ['unknown', 'sideloaded']])(
    'refuses to guess retention from a %s source',
    async (_kind, source) => {
      const body = scanBody();
      if (source === undefined) delete (body as Record<string, unknown>).source;
      else body.source = source;

      const response = await request(app)
        .post('/api/avatar')
        .set('Authorization', authorization())
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('source');
    }
  );

  it('drops metadata the archive was not promised', async () => {
    const created = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(scanBody({ metadata: { confidence: 0.5, promptUsed: 'leak me' } }));

    expect(created.status).toBe(201);
    expect(created.body.metadata).not.toHaveProperty('promptUsed');
    expect(JSON.stringify(created.body)).not.toContain('leak me');
  });

  it('rejects a sprite that is not a PNG data URL and writes nothing', async () => {
    const response = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(scanBody({ spriteDataUrl: 'https://example.com/sprite.png' }));

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(
      'spriteDataUrl must be a base64 PNG data URL.'
    );

    const list = await request(app)
      .get('/api/avatar')
      .set('Authorization', authorization());
    expect(list.body.total).toBe(0);
  });

  it('rejects a sprite too large for a Firestore document', async () => {
    const response = await request(app)
      .post('/api/avatar')
      .set('Authorization', authorization())
      .send(
        scanBody({
          spriteDataUrl: `data:image/png;base64,${'A'.repeat(512_001)}`,
        })
      );

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Sprite is too large to save.');
  });

  it('rejects an unauthenticated save', async () => {
    const response = await request(app).post('/api/avatar').send(scanBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorised.' });
  });
});

describe('DELETE /api/avatar/:avatarId (the archive shovel)', () => {
  it('deletes an owned avatar and answers 204 with no body', async () => {
    await seedAvatar({ id: 'shovel-target', speciesName: 'Doomed Fern' });

    const response = await request(app)
      .delete('/api/avatar/shovel-target')
      .set('Authorization', authorization());

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});

    const doc = await getDb()
      .collection('avatar_records')
      .doc('shovel-target')
      .get();
    expect(doc.exists).toBe(false);
  });

  it("answers 404 for someone else's avatar and leaves it in place", async () => {
    await seedAvatar({
      id: 'foreign-avatar',
      userId: FOREIGN_ID,
      speciesName: 'Foreign Fern',
    });

    const response = await request(app)
      .delete('/api/avatar/foreign-avatar')
      .set('Authorization', authorization());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Avatar not found.' });

    const doc = await getDb()
      .collection('avatar_records')
      .doc('foreign-avatar')
      .get();
    expect(doc.exists).toBe(true);
  });

  it('answers 404 for an id that never existed', async () => {
    const response = await request(app)
      .delete('/api/avatar/never-existed')
      .set('Authorization', authorization());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Avatar not found.' });
  });

  it('rejects an unauthenticated delete without touching the record', async () => {
    await seedAvatar({ id: 'kept-avatar', speciesName: 'Kept Fern' });

    const response = await request(app).delete('/api/avatar/kept-avatar');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorised.' });

    const doc = await getDb().collection('avatar_records').doc('kept-avatar').get();
    expect(doc.exists).toBe(true);
  });
});
