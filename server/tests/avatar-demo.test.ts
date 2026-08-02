import request from 'supertest';
import {
  DEMO_AVATAR_TEMPLATES,
  DEMO_SET_VERSION,
  demoAvatarId,
} from '../data/demo-avatar-templates';
import { plantAssetUrl } from '../data/sprite-catalog';
import { getDb } from '../firebase';
import avatarRepository from '../repositories/avatars';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const USER_ID = 'demo-tools-user';
const DEMO_CONFLICT_MESSAGE = 'Demo avatar set conflicts with an existing record.';

function demoRef(template = DEMO_AVATAR_TEMPLATES[0]) {
  return getDb().collection('avatar_records').doc(demoAvatarId(USER_ID, template.id));
}

function collectedReplacement() {
  return {
    userId: USER_ID,
    speciesName: 'Collected Fern',
    speciesFamily: 'Pteridaceae',
    spriteUrl: '/static/sprites/collected-fern.png',
    discoveredAt: new Date('2026-07-22T00:00:00.000Z'),
    source: 'mobile',
    isTemporary: false,
    expiresAt: null,
    stats: { hp: 100, attack: 50, defense: 50, speed: 50 },
    metadata: { isDemo: false },
  };
}

async function expectExactDemoSet(result: Awaited<ReturnType<typeof avatarRepository.ensureDemoSet>>) {
  expect(DEMO_AVATAR_TEMPLATES).toHaveLength(5);
  expect(result).toMatchObject({ page: 1, pageSize: 20, total: 5 });
  expect(result.items).toHaveLength(5);

  const itemsById = new Map(result.items.map((item) => [item.id, item]));
  const documents = await Promise.all(
    DEMO_AVATAR_TEMPLATES.map((template) => demoRef(template).get())
  );

  DEMO_AVATAR_TEMPLATES.forEach((template, index) => {
    const id = demoAvatarId(USER_ID, template.id);
    const expectedMetadata = {
      isDemo: true,
      version: DEMO_SET_VERSION,
      templateId: template.id,
      displayName: template.speciesName,
      presentationKey: `demo:${template.id}`,
    };
    expect(itemsById.get(id)).toMatchObject({ id, userId: USER_ID, metadata: expectedMetadata });
    expect(documents[index].exists).toBe(true);
    expect(documents[index].id).toBe(id);
    expect(documents[index].data()).toMatchObject({ userId: USER_ID, metadata: expectedMetadata });
  });
}

describe('per-user demo avatar set', () => {
  let previousAuthDevBypass: string | undefined;
  let previousDemoTools: string | undefined;

  beforeEach(async () => {
    previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
    previousDemoTools = process.env.ENABLE_DEMO_TOOLS;
    process.env.AUTH_DEV_BYPASS = 'false';
    process.env.ENABLE_DEMO_TOOLS = 'true';
    mockAuthAdmin.verifyIdToken.mockReset();
    await clearFirestore();
  });

  afterEach(() => {
    if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
    else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
    if (previousDemoTools === undefined) delete process.env.ENABLE_DEMO_TOOLS;
    else process.env.ENABLE_DEMO_TOOLS = previousDemoTools;
  });

  it.each([
    ['missing', {}],
    ['non-string', { userId: 42 }],
    ['foreign', { userId: 'another-user' }],
  ])(
    'returns null for a malformed avatar with a %s raw owner marker',
    async (_kind, rawOwner) => {
      const id = `malformed-owner-${_kind}`;
      await getDb().collection('avatar_records').doc(id).set({
        ...rawOwner,
        privateMalformedDetail: 'must-not-be-decoded',
      });

      await expect(avatarRepository.getOwned(USER_ID, id)).resolves.toBeNull();
    }
  );

  it('still decodes caller-owned documents and rejects malformed owned data', async () => {
    const id = 'malformed-owned-avatar';
    await getDb().collection('avatar_records').doc(id).set({
      userId: USER_ID,
      privateMalformedDetail: 'owned-document-must-be-decoded',
    });

    await expect(avatarRepository.getOwned(USER_ID, id)).rejects.toThrow(
      /avatar_records/
    );
  });

  it('keeps listByUser query filtering before decoding returned documents', async () => {
    const reference = getDb()
      .collection('avatar_records')
      .doc('malformed-list-avatar');
    await reference.set({ userId: 'another-user', malformed: true });

    await expect(avatarRepository.listByUser(USER_ID, 1, 20)).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await reference.set({ userId: USER_ID, malformed: true });
    await expect(avatarRepository.listByUser(USER_ID, 1, 20)).rejects.toThrow(
      /avatar_records/
    );
  });

  it('idempotently creates and persists five exact caller-owned demo records', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    const second = await avatarRepository.ensureDemoSet(USER_ID);

    await expectExactDemoSet(second);
  });

  it('completes a partial set when every existing deterministic record is valid', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    await demoRef(DEMO_AVATAR_TEMPLATES[4]).delete();

    const completed = await avatarRepository.ensureDemoSet(USER_ID);

    await expectExactDemoSet(completed);
  });

  // The pre-made sprite set moved every demo record's spriteUrl. Accounts that
  // had already enabled the set were left holding the old, unserved path, and a
  // 409 on re-enable would have meant toggling the set off to pick the new one
  // up — losing nothing, but for no reason a player could see.
  it('refreshes a demo record whose template has moved under it', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    const template = DEMO_AVATAR_TEMPLATES[0];
    const ref = demoRef(template);
    await ref.set(
      { spriteUrl: '/static/sprites/helianthus-annuus.png', stats: { hp: 1, attack: 1, defense: 1, speed: 1 } },
      { merge: true }
    );

    const refreshed = await avatarRepository.ensureDemoSet(USER_ID);

    await expectExactDemoSet(refreshed);
    expect((await ref.get()).data()).toMatchObject({
      spriteUrl: plantAssetUrl(template.spriteFile),
      stats: template.stats,
    });
  });

  it('accepts an equivalent demo record when Firestore map keys are reordered', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    const ref = demoRef();
    const db = getDb();
    const original = (await ref.get()).data()!;
    const originalStats = original.stats as Record<string, number>;
    const originalMetadata = original.metadata as Record<string, unknown>;
    const locality = originalMetadata.locality as Record<string, string>;
    await ref.set(
      {
        stats: {
          speed: originalStats.speed,
          defense: originalStats.defense,
          attack: originalStats.attack,
          hp: originalStats.hp,
        },
        metadata: {
          ...originalMetadata,
          locality: { venue: locality.venue, city: locality.city },
        },
      },
      { merge: true }
    );

    const originalRunTransaction = db.runTransaction.bind(db);
    const runTransactionSpy = jest.spyOn(db, 'runTransaction') as jest.SpyInstance;
    runTransactionSpy.mockImplementation(
      (updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<unknown>) =>
        originalRunTransaction(async (transaction) => {
          const originalGet = transaction.get.bind(transaction);
          const getSpy = jest.spyOn(transaction, 'get').mockImplementation(async (documentRef) => {
            const snapshot = await originalGet(documentRef);
            if (documentRef.path !== ref.path) return snapshot;
            const originalData = snapshot.data.bind(snapshot);
            jest.spyOn(snapshot, 'data').mockImplementation(() => {
              const data = originalData()! as FirebaseFirestore.DocumentData;
              const stats = data.stats as Record<string, number>;
              const metadata = data.metadata as Record<string, unknown>;
              const nestedLocality = metadata.locality as Record<string, string>;
              return {
                ...data,
                stats: {
                  speed: stats.speed,
                  defense: stats.defense,
                  attack: stats.attack,
                  hp: stats.hp,
                },
                metadata: {
                  ...metadata,
                  locality: { venue: nestedLocality.venue, city: nestedLocality.city },
                },
              };
            });
            return snapshot;
          });

          try {
            return await updateFunction(transaction);
          } finally {
            getSpy.mockRestore();
          }
        })
    );

    try {
      const result = await avatarRepository.ensureDemoSet(USER_ID);

      await expectExactDemoSet(result);
    } finally {
      runTransactionSpy.mockRestore();
    }
  });

  it.each([
    'foreign owner',
    'collected record',
    'wrong version',
    'wrong template ID',
  ])('rejects an enable collision with a %s', async (kind) => {
    await avatarRepository.ensureDemoSet(USER_ID);
    const template = DEMO_AVATAR_TEMPLATES[0];
    const ref = demoRef(template);
    const original = (await ref.get()).data()!;
    const metadata = original.metadata as Record<string, unknown>;
    const patch =
      kind === 'foreign owner'
        ? { userId: 'another-user' }
        : {
            metadata: {
              ...metadata,
              ...(kind === 'collected record' ? { isDemo: false } : {}),
              ...(kind === 'wrong version' ? { version: 'wrong-version' } : {}),
              ...(kind === 'wrong template ID' ? { templateId: 'wrong-template' } : {}),
            },
          };
    await ref.set(patch, { merge: true });

    await expect(avatarRepository.ensureDemoSet(USER_ID)).rejects.toMatchObject({
      status: 409,
      message: DEMO_CONFLICT_MESSAGE,
    });
    await expect(ref.get()).resolves.toMatchObject({ exists: true, data: expect.any(Function) });
    expect((await ref.get()).data()).toMatchObject(patch);
  });

  it('is idempotent when two enable operations race', async () => {
    const [first, second] = await Promise.all([
      avatarRepository.ensureDemoSet(USER_ID),
      avatarRepository.ensureDemoSet(USER_ID),
    ]);

    await expectExactDemoSet(first);
    await expectExactDemoSet(second);
  });

  it('removes demo records without deleting a collected record', async () => {
    await getDb().collection('avatar_records').doc('caught-1').set(collectedReplacement());
    await avatarRepository.ensureDemoSet(USER_ID);

    const result = await avatarRepository.removeDemoSet(USER_ID);

    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(result.items.map((item) => item.id)).toEqual(['caught-1']);
  });

  it('revalidates a collected replacement before committing demo removal', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    const db = getDb();
    const originalRunTransaction = db.runTransaction.bind(db);
    const targetRef = demoRef();
    const refs = DEMO_AVATAR_TEMPLATES.map((template) => demoRef(template));
    const staleSnapshots = await Promise.all(refs.map((ref) => ref.get()));
    let firstAttempt = true;
    const runTransactionSpy = jest.spyOn(db, 'runTransaction') as jest.SpyInstance;

    runTransactionSpy.mockImplementation(
      async (updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<unknown>) => {
        if (!firstAttempt) return originalRunTransaction(updateFunction);
        firstAttempt = false;
        const deletedRefs: FirebaseFirestore.DocumentReference[] = [];
        const staleTransaction = {
          get: jest.fn((ref: FirebaseFirestore.DocumentReference) =>
            Promise.resolve(staleSnapshots.find((snapshot) => snapshot.ref.path === ref.path)!)
          ),
          delete: jest.fn((ref: FirebaseFirestore.DocumentReference) => {
            deletedRefs.push(ref);
          }),
        };

        await updateFunction(staleTransaction as unknown as FirebaseFirestore.Transaction);
        expect(deletedRefs.some((ref) => ref.path === targetRef.path)).toBe(true);
        await targetRef.set(collectedReplacement());
        return originalRunTransaction(updateFunction);
      }
    );

    try {
      const result = await avatarRepository.removeDemoSet(USER_ID);
      expect(firstAttempt).toBe(false);
      expect(result).toMatchObject({ total: 1 });
      expect(result.items[0]).toMatchObject({ id: targetRef.id, metadata: { isDemo: false } });
      await expect(targetRef.get()).resolves.toMatchObject({ exists: true });
    } finally {
      runTransactionSpy.mockRestore();
    }
  });

  for (const method of ['post', 'delete'] as const) {
    it(`returns 404 for disabled ${method.toUpperCase()} demo requests before authentication`, async () => {
      process.env.ENABLE_DEMO_TOOLS = 'false';

      const unauthenticated =
        method === 'post'
          ? await request(app).post('/api/avatar/demo')
          : await request(app).delete('/api/avatar/demo');
      mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: USER_ID,
        email_verified: false,
      });
      const unverified =
        method === 'post'
          ? await request(app).post('/api/avatar/demo').set('Authorization', 'Bearer pending')
          : await request(app).delete('/api/avatar/demo').set('Authorization', 'Bearer pending');

      expect(unauthenticated.status).toBe(404);
      expect(unverified.status).toBe(404);
      expect(mockAuthAdmin.verifyIdToken).not.toHaveBeenCalled();
    });
  }

  it('returns 401 when enabled demo routes have no token', async () => {
    const response = await request(app).post('/api/avatar/demo');

    expect(response.status).toBe(401);
  });

  it('returns 403 when an enabled demo route receives an unverified token', async () => {
    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: USER_ID,
      email_verified: false,
    });

    const response = await request(app)
      .post('/api/avatar/demo')
      .set('Authorization', 'Bearer pending');

    expect(response.status).toBe(403);
  });

  it('enables the exact caller-owned set through a verified route', async () => {
    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: USER_ID,
      email_verified: true,
    });

    const response = await request(app)
      .post('/api/avatar/demo')
      .set('Authorization', 'Bearer verified');

    expect(response.status).toBe(200);
    await expectExactDemoSet(response.body);
  });

  it('disables the verified demo set while preserving a collected avatar', async () => {
    const collectedRef = getDb()
      .collection('avatar_records')
      .doc('preserved-collected-avatar');
    await collectedRef.set(collectedReplacement());
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: USER_ID,
      email_verified: true,
    });

    const enabled = await request(app)
      .post('/api/avatar/demo')
      .set('Authorization', 'Bearer verified');
    const disabled = await request(app)
      .delete('/api/avatar/demo')
      .set('Authorization', 'Bearer verified');

    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({ total: 6 });
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: collectedRef.id,
          userId: USER_ID,
          speciesName: 'Collected Fern',
          metadata: { isDemo: false },
        },
      ],
    });

    const [collectedDocument, ...demoDocuments] = await Promise.all([
      collectedRef.get(),
      ...DEMO_AVATAR_TEMPLATES.map((template) => demoRef(template).get()),
    ]);
    expect(collectedDocument.exists).toBe(true);
    expect(collectedDocument.data()).toMatchObject({
      userId: USER_ID,
      speciesName: 'Collected Fern',
      metadata: { isDemo: false },
    });
    expect(demoDocuments.every((document) => !document.exists)).toBe(true);
  });

  it('returns a controlled conflict from the verified enable route', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    await demoRef().set({ metadata: { isDemo: false } }, { merge: true });
    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: USER_ID,
      email_verified: true,
    });

    const response = await request(app)
      .post('/api/avatar/demo')
      .set('Authorization', 'Bearer verified');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: DEMO_CONFLICT_MESSAGE });
  });
});
