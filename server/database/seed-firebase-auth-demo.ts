/** Creates/updates the Firebase Auth demo user that matches the seeded avatar
 *  owner. This lets the React auth test page use real Firebase ID tokens while
 *  still showing the existing demo avatars.
 *
 *  Run: npm run seed:firebase-auth-demo -w server
 */
import '../env';
import bcrypt from 'bcrypt';
import { getAuthAdmin, getDb } from '../firebase';
import { DEMO_EMAIL, DEMO_USER_ID, SEED_USERS } from './sample-data';

const DEMO_PASSWORD = 'Password123!';
const BCRYPT_COST = 12;

async function run(): Promise<void> {
  const auth = getAuthAdmin();
  const demoUser = SEED_USERS.find((u) => u.id === DEMO_USER_ID)!;

  try {
    await auth.getUser(DEMO_USER_ID);
    await auth.updateUser(DEMO_USER_ID, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      displayName: demoUser.displayName,
      emailVerified: true,
    });
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;
    if (code !== 'auth/user-not-found') throw err;
    await auth.createUser({
      uid: DEMO_USER_ID,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      displayName: demoUser.displayName,
      emailVerified: true,
    });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const now = new Date().toISOString();
  const db = getDb();
  await db.collection('users').doc(DEMO_USER_ID).set(
    {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      displayName: demoUser.displayName,
      isVerified: true,
      passwordHash,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
  await db.collection('password_history').doc(`${DEMO_USER_ID}-initial`).set({
    id: `${DEMO_USER_ID}-initial`,
    userId: DEMO_USER_ID,
    passwordHash,
    changedAt: now,
  });

  console.log(
    `Firebase Auth demo user ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (uid ${DEMO_USER_ID})`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Firebase Auth demo seed failed:', err);
    process.exit(1);
  });
