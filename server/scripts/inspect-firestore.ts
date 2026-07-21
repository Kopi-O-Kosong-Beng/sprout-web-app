/** Counts Firestore collections and optionally prints redacted summaries. */
import '../env';
import { getDb } from '../firebase';

const COLLECTIONS = [
  'users',
  'password_history',
  'avatar_records',
  'battle_sessions',
  'query_tickets',
  'counters',
] as const;

const SAFE_FIELDS: Record<string, string[]> = {
  users: ['displayName', 'isVerified', 'createdAt', 'updatedAt'],
  password_history: ['userId', 'changedAt'],
  avatar_records: [
    'userId',
    'speciesName',
    'speciesFamily',
    'source',
    'isTemporary',
    'discoveredAt',
  ],
  battle_sessions: ['userId', 'status', 'turn', 'createdAt', 'updatedAt'],
  query_tickets: [
    'refNumber',
    'category',
    'status',
    'submitterEmailStatus',
    'adminEmailStatus',
    'createdAt',
    'updatedAt',
  ],
  counters: ['seq'],
};

export interface InspectMode {
  includeDocuments: boolean;
}

export function parseInspectMode(args: string[]): InspectMode {
  if (args.length === 0) return { includeDocuments: false };
  if (args.length === 1 && args[0] === '--include-documents') {
    return { includeDocuments: true };
  }
  throw new Error('Use --include-documents to print redacted summaries.');
}

export function redactFirestoreDocument(
  collectionName: string,
  documentId: string,
  data: FirebaseFirestore.DocumentData
): Record<string, unknown> {
  const summary: Record<string, unknown> = { id: documentId };
  for (const field of SAFE_FIELDS[collectionName] ?? []) {
    if (data[field] !== undefined) summary[field] = data[field];
  }
  return summary;
}

async function inspectFirestore(mode: InspectMode): Promise<void> {
  const db = getDb();
  console.log('Datastore: Firestore');
  for (const collectionName of COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    console.log(`${collectionName}: ${snapshot.size}`);
    if (mode.includeDocuments) {
      snapshot.docs.slice(0, 25).forEach((document) => {
        console.log(
          JSON.stringify(
            redactFirestoreDocument(collectionName, document.id, document.data())
          )
        );
      });
    }
  }
}

if (require.main === module) {
  inspectFirestore(parseInspectMode(process.argv.slice(2)))
    .then(() => {
      process.exitCode = 0;
    })
    .catch(() => {
      console.error('Firestore inspection failed.');
      process.exitCode = 1;
    });
}
