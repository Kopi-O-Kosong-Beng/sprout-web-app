import { getDb } from '../firebase';
import { DEMO_USER_ID } from '../data/demo-avatar-templates';
import { seedFirestoreDemo } from '../scripts/seed-firestore';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore demo seed', () => {
  beforeEach(clearFirestore);

  it('replaces only demo-owned records and preserves unrelated application data', async () => {
    const db = getDb();
    await Promise.all([
      db.collection('users').doc('real-user').set({ id: 'real-user' }),
      db.collection('avatar_records').doc('real-avatar').set({
        id: 'real-avatar',
        userId: 'real-user',
      }),
      db.collection('password_history').doc('real-history').set({
        id: 'real-history',
        userId: 'real-user',
      }),
      db.collection('avatar_records').doc('legacy-demo-avatar').set({
        id: 'legacy-demo-avatar',
        userId: DEMO_USER_ID,
      }),
    ]);

    await seedFirestoreDemo({
      db,
      now: new Date('2026-07-22T00:00:00.000Z'),
      passwordHash: 'demo-password-hash',
    });

    await expect(db.collection('users').doc('real-user').get()).resolves.toMatchObject({
      exists: true,
    });
    await expect(
      db.collection('avatar_records').doc('real-avatar').get()
    ).resolves.toMatchObject({ exists: true });
    await expect(
      db.collection('password_history').doc('real-history').get()
    ).resolves.toMatchObject({ exists: true });
    await expect(
      db.collection('avatar_records').doc('legacy-demo-avatar').get()
    ).resolves.toMatchObject({ exists: false });

    const demoAvatars = await db
      .collection('avatar_records')
      .where('userId', '==', DEMO_USER_ID)
      .get();
    expect(demoAvatars.size).toBe(5);
    expect(demoAvatars.docs.map((document) => document.id).sort()).toEqual([
      'demo-avatar-amanita-muscaria',
      'demo-avatar-ficus-lyrata',
      'demo-avatar-helianthus-annuus',
      'demo-avatar-monstera-deliciosa',
      'demo-avatar-quercus-robur',
    ]);
  });
});
