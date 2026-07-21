/** Firestore seed — writes the shared demo dataset into Cloud Firestore so the
 *  frontend has users + avatars to build against.
 *
 *  Run: npm run seed:firestore (requires Firebase Admin credentials)
 */
import '../env';
import bcrypt from 'bcrypt';
import type { Firestore } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import {
  DEMO_USER_ID,
  SEED_USERS,
  buildAvatarRows,
} from '../data/demo-avatar-templates';

const BCRYPT_COST = 12;

export interface SeedFirestoreOptions {
  db?: Firestore;
  now?: Date;
  passwordHash?: string;
}

export async function seedFirestoreDemo(
  options: SeedFirestoreOptions = {}
): Promise<{ userCount: number; avatarCount: number }> {
  const db = options.db ?? getDb();
  const passwordHash =
    options.passwordHash ?? (await bcrypt.hash('Password123!', BCRYPT_COST));
  const now = options.now ?? new Date();
  const avatarRows = buildAvatarRows(now);

  const [existingAvatars, existingHistory] = await Promise.all([
    db.collection('avatar_records').where('userId', '==', DEMO_USER_ID).get(),
    db.collection('password_history').where('userId', '==', DEMO_USER_ID).get(),
  ]);

  const batch = db.batch();
  existingAvatars.docs.forEach((document) => batch.delete(document.ref));
  existingHistory.docs.forEach((document) => batch.delete(document.ref));
  SEED_USERS.forEach((u) => {
    batch.set(db.collection('users').doc(u.id), {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      isVerified: u.isVerified,
      passwordHash,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      lastLogin: null,
      lastLogout: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    batch.set(db.collection('password_history').doc(`${u.id}-initial`), {
      id: `${u.id}-initial`,
      userId: u.id,
      passwordHash,
      changedAt: now.toISOString(),
    });
  });
  avatarRows.forEach((a) => {
    batch.set(db.collection('avatar_records').doc(a.id), a);
  });
  await batch.commit();

  return { userCount: SEED_USERS.length, avatarCount: avatarRows.length };
}

async function run(): Promise<void> {
  const result = await seedFirestoreDemo();
  console.log(
    `Seeded Firestore demo: ${result.userCount} user(s), ${result.avatarCount} avatar(s).`
  );
}

if (require.main === module) {
  run()
    .then(() => {
      process.exitCode = 0;
    })
    .catch(() => {
      console.error('Firestore seed failed.');
      process.exitCode = 1;
    });
}
