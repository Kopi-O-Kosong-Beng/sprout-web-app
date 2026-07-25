import { Timestamp } from 'firebase-admin/firestore';
import avatarRepository from '../repositories/avatars';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore-only runtime repositories', () => {
  beforeEach(clearFirestore);

  it('reads Firestore through the stable repository import', async () => {
    await getDb().collection('avatar_records').doc('owned').set({
      id: 'owned',
      userId: 'user-1',
      speciesName: 'Fern',
      speciesFamily: 'Test',
      spriteUrl: '/fern.png',
      discoveredAt: '2026-07-22T00:00:00.000Z',
      source: 'mobile',
      isTemporary: false,
      expiresAt: null,
      stats: { hp: 100, attack: 50, defense: 50, speed: 50 },
      metadata: null,
    });

    await expect(avatarRepository.listByUser('user-1', 1, 20)).resolves.toMatchObject({
      total: 1,
    });
  });

  it('derives avatar IDs from paths and sorts normalized Firestore timestamps', async () => {
    const db = getDb();
    await Promise.all([
      db.collection('avatar_records').doc('older-avatar').set({
        userId: 'user-1',
        speciesName: 'Older Fern',
        speciesFamily: 'Test',
        spriteUrl: '/older.png',
        discoveredAt: Timestamp.fromDate(new Date('2026-07-20T00:00:00.000Z')),
        source: 'mobile',
        isTemporary: false,
        expiresAt: null,
        stats: { hp: 100, attack: 50, defense: 50, speed: 50 },
        metadata: null,
      }),
      db.collection('avatar_records').doc('newer-avatar').set({
        userId: 'user-1',
        speciesName: 'Newer Fern',
        speciesFamily: 'Test',
        spriteUrl: '/newer.png',
        discoveredAt: new Date('2026-07-21T00:00:00.000Z'),
        source: 'web',
        isTemporary: true,
        expiresAt: Timestamp.fromDate(new Date('2026-07-22T00:00:00.000Z')),
        stats: { hp: 90, attack: 60, defense: 40, speed: 70 },
        metadata: null,
      }),
    ]);

    await expect(avatarRepository.listByUser('user-1', 1, 20)).resolves.toMatchObject({
      total: 2,
      items: [
        {
          id: 'newer-avatar',
          discoveredAt: '2026-07-21T00:00:00.000Z',
          expiresAt: '2026-07-22T00:00:00.000Z',
        },
        {
          id: 'older-avatar',
          discoveredAt: '2026-07-20T00:00:00.000Z',
        },
      ],
    });
  });

  it('rejects malformed required avatar timestamps with a controlled error', async () => {
    await getDb().collection('avatar_records').doc('malformed-avatar').set({
      userId: 'user-1',
      speciesName: 'Broken Fern',
      speciesFamily: 'Test',
      spriteUrl: '/broken.png',
      discoveredAt: { seconds: 'not-a-number' },
      source: 'mobile',
      isTemporary: false,
      expiresAt: null,
      stats: { hp: 100, attack: 50, defense: 50, speed: 50 },
      metadata: null,
    });

    await expect(avatarRepository.listByUser('user-1', 1, 20)).rejects.toThrow(
      'Invalid Firestore avatar_records document malformed-avatar: discoveredAt must be a timestamp.'
    );
  });
});
