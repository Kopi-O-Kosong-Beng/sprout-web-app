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
});
