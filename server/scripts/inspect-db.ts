/** Prints the contents of the active datastore (Firestore or SQLite, whichever
 *  DATASTORE points at) so you can eyeball what's persisted without opening the
 *  Firebase console or a SQLite GUI.
 *
 *  Run:  npm run inspect
 */
import '../env';

const DATASTORE = process.env.DATASTORE ?? 'sqlite';
const COLLECTIONS = ['users', 'avatar_records', 'battle_sessions', 'query_tickets'];

async function inspectFirestore(): Promise<void> {
  const { getDb } = await import('../firebase');
  const db = getDb();
  console.log('Datastore: Firestore\n');
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).limit(25).get();
    console.log(`--- ${name} (${snap.size}) ---`);
    snap.forEach((doc) => console.log(' ', JSON.stringify(doc.data())));
    console.log('');
  }
}

async function inspectSqlite(): Promise<void> {
  const { default: db } = await import('../database/db');
  console.log('Datastore: SQLite\n');
  for (const name of COLLECTIONS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (db as any)(name).select('*').limit(25);
    console.log(`--- ${name} (${rows.length}) ---`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.forEach((r: any) => console.log(' ', JSON.stringify(r)));
    console.log('');
  }
  await db.destroy();
}

(DATASTORE === 'firestore' ? inspectFirestore() : inspectSqlite())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Inspect failed:', err);
    process.exit(1);
  });
