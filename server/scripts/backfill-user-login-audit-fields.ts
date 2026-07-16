import '../env';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../firebase';

const REMOVED_AUDIT_FIELDS = [
  'lastLoginAt',
  'lastLoginDate',
  'lastLoginTime',
  'lastLoginAtReadable',
  'lastLogoutAt',
  'lastLogoutDate',
  'lastLogoutTime',
  'lastLogoutAtReadable',
  'LastLogin',
  'LastLogout',
] as const;

async function run(): Promise<void> {
  const db = getDb();
  const snap = await db.collection('users').get();
  if (snap.empty) {
    console.log('No users found. Nothing to backfill.');
    return;
  }

  let changed = 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const patch: Record<string, unknown> = {};
    if (!('lastLogin' in data)) {
      patch.lastLogin =
        data.LastLogin ?? data.lastLoginAtReadable ?? data.lastLoginTime ?? null;
    }
    if (!('lastLogout' in data)) {
      patch.lastLogout =
        data.LastLogout ?? data.lastLogoutAtReadable ?? data.lastLogoutTime ?? null;
    }
    REMOVED_AUDIT_FIELDS.forEach((field) => {
      if (field in data) patch[field] = FieldValue.delete();
    });
    if (Object.keys(patch).length === 0) return;
    batch.set(doc.ref, patch, { merge: true });
    changed += 1;
  });

  if (changed === 0) {
    console.log(`Checked ${snap.size} user doc(s). Audit fields already match.`);
    return;
  }

  await batch.commit();
  console.log(`Cleaned audit fields on ${changed} of ${snap.size} user doc(s).`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('User audit field backfill failed:', err);
    process.exit(1);
  });
