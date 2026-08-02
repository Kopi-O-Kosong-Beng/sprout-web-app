import request from 'supertest';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';
import avatarRepository from '../repositories/avatars';
import dexRepository from '../repositories/dex';
import { clearFirestore, seedFirestoreUser } from './firestore-test-utils';

const OWNER = 'user-owner';
const FINDER = 'user-finder';
let previousAuthDevBypass: string | undefined;

function authorization(userId: string): string {
  return `Bearer verified:${userId}`;
}

async function seedAvatar() {
  const { record } = await avatarRepository.upsertFromScan(OWNER, {
    speciesName: 'Fern',
    speciesFamily: 'Polypodiaceae',
    spriteUrl: 'https://cdn.test/fern.png',
    stats: { hp: 120, attack: 55, defense: 60, speed: 40 },
    metadata: null,
  });
  return record;
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

describe('avatar detail discovery block', () => {
  it('returns the first discoverer display name, never the email', async () => {
    await seedFirestoreUser({
      id: FINDER,
      email: 'finder@example.test',
      displayName: 'Justin',
      isVerified: true,
    });
    await dexRepository.recordDiscovery('fern', FINDER, 'Fern');
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('Authorization', authorization(OWNER));

    expect(response.status).toBe(200);
    expect(response.body.discovery.firstDiscoveredByName).toBe('Justin');
    expect(response.body.discovery.discoveryCount).toBeGreaterThanOrEqual(1);
    expect(response.body.discovery.isFirstDiscoverer).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('finder@example.test');
  });

  it('marks the caller when they were the first discoverer', async () => {
    await seedFirestoreUser({
      id: OWNER,
      email: 'owner@example.test',
      displayName: 'Zhi Feng',
      isVerified: true,
    });
    await dexRepository.recordDiscovery('fern', OWNER, 'Fern');
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('Authorization', authorization(OWNER));

    expect(response.body.discovery.isFirstDiscoverer).toBe(true);
  });

  it('returns discovery: null when no dex record exists', async () => {
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('Authorization', authorization(OWNER));

    expect(response.status).toBe(200);
    expect(response.body.discovery).toBeNull();
  });

  it('still returns the avatar when the discoverer profile is missing', async () => {
    await dexRepository.recordDiscovery('fern', 'ghost-user', 'Fern');
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('Authorization', authorization(OWNER));

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(record.id);
    expect(response.body.discovery).toBeNull();
  });
});
