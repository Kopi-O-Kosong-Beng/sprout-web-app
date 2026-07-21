import request from 'supertest';
import app from '../app';
import { DEMO_AVATAR_TEMPLATES, DEMO_SET_VERSION, demoAvatarId } from '../data/demo-avatar-templates';
import { getDb } from '../firebase';
import avatarRepository from '../repositories/avatars';
import { clearFirestore } from './firestore-test-utils';

const USER_ID = 'demo-tools-user';

function authed(agent: request.Test): request.Test {
  return agent.set('x-dev-uid', USER_ID);
}

describe('per-user demo avatar set', () => {
  let previousAuthDevBypass: string | undefined;
  let previousDemoTools: string | undefined;

  beforeEach(async () => {
    previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
    previousDemoTools = process.env.ENABLE_DEMO_TOOLS;
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.ENABLE_DEMO_TOOLS = 'true';
    await clearFirestore();
  });

  afterEach(() => {
    if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
    else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
    if (previousDemoTools === undefined) delete process.env.ENABLE_DEMO_TOOLS;
    else process.env.ENABLE_DEMO_TOOLS = previousDemoTools;
  });

  it('idempotently creates five caller-owned demo records', async () => {
    const first = await avatarRepository.ensureDemoSet(USER_ID);
    const second = await avatarRepository.ensureDemoSet(USER_ID);

    expect(first).toMatchObject({ page: 1, pageSize: 20, total: 5 });
    expect(second.items.map((item) => item.id).sort()).toEqual(
      DEMO_AVATAR_TEMPLATES.map((template) => demoAvatarId(USER_ID, template.id)).sort()
    );
    expect(second.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: USER_ID,
          metadata: expect.objectContaining({
            isDemo: true,
            version: DEMO_SET_VERSION,
          }),
        }),
      ])
    );
  });

  it('is idempotent when two enable operations race', async () => {
    const [first, second] = await Promise.all([
      avatarRepository.ensureDemoSet(USER_ID),
      avatarRepository.ensureDemoSet(USER_ID),
    ]);

    expect(first.total).toBe(5);
    expect(second.total).toBe(5);
  });

  it('removes demo records without deleting a collected record', async () => {
    const db = getDb();
    await db.collection('avatar_records').doc('caught-1').set({
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
    });
    await avatarRepository.ensureDemoSet(USER_ID);

    const result = await avatarRepository.removeDemoSet(USER_ID);

    expect(result).toMatchObject({ total: 1 });
    expect(result.items.map((item) => item.id)).toEqual(['caught-1']);
  });

  it('does not delete a deterministic record whose demo metadata no longer matches', async () => {
    await avatarRepository.ensureDemoSet(USER_ID);
    const template = DEMO_AVATAR_TEMPLATES[0];
    const protectedId = demoAvatarId(USER_ID, template.id);
    await getDb().collection('avatar_records').doc(protectedId).set(
      { metadata: { isDemo: false, version: DEMO_SET_VERSION, templateId: template.id } },
      { merge: true }
    );

    const result = await avatarRepository.removeDemoSet(USER_ID);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: protectedId, userId: USER_ID });
  });

  it('enables the caller-owned set through the protected route', async () => {
    const response = await authed(request(app).post('/api/avatar/demo'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 5 });
    expect(response.body.items.every((item: { userId: string }) => item.userId === USER_ID)).toBe(
      true
    );
  });

  it('returns 404 to an authenticated caller when demo tools are disabled', async () => {
    process.env.ENABLE_DEMO_TOOLS = 'false';

    const response = await authed(request(app).post('/api/avatar/demo'));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  it('keeps demo routes behind authentication', async () => {
    const response = await request(app).delete('/api/avatar/demo');

    expect(response.status).toBe(401);
  });
});
