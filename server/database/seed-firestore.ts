/** Firestore seed — writes the shared demo dataset into Cloud Firestore so the
 *  frontend has users + avatars to build against.
 *
 *  Run:  npm run seed:firestore   (requires DATASTORE=firestore + a key)
 */
import '../env';
import bcrypt from 'bcrypt';
import { getDb } from '../firebase';
import { SEED_USERS, buildAvatarRows } from './sample-data';

const BCRYPT_COST = 12;

async function run(): Promise<void> {
  const db = getDb();
  const passwordHash = await bcrypt.hash('Password123!', BCRYPT_COST);

  // Clear existing demo docs (idempotent reseed)
  for (const name of ['users', 'avatar_records', 'password_history']) {
    const snap = await db.collection(name).get();
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const batch = db.batch();
  SEED_USERS.forEach((u) => {
    batch.set(db.collection('users').doc(u.id), {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      isVerified: u.isVerified,
      passwordHash,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    batch.set(db.collection('password_history').doc(`${u.id}-initial`), {
      id: `${u.id}-initial`,
      userId: u.id,
      passwordHash,
      changedAt: new Date().toISOString(),
    });
  });
  buildAvatarRows().forEach((a) => {
    batch.set(db.collection('avatar_records').doc(a.id), a);
  });
  await batch.commit();

  console.log(
    `Seeded Firestore: ${SEED_USERS.length} user(s), ${buildAvatarRows().length} avatar(s).`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Firestore seed failed:', err);
    process.exit(1);
  });
