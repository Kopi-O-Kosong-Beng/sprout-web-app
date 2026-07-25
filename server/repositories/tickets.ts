/** Firebase Admin implementation of the ticket repository.
 *  RefNumber sequence uses a per-day counter document inside a Firestore
 *  transaction — atomic under concurrency (Req 9.10), no duplicate numbers.
 */
import { randomUUID } from 'crypto';
import type { Transaction } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import type {
  DeliveryStatus,
  Ticket,
  TicketCategory,
  TicketInput,
  TicketNotificationPatch,
  TicketRepository,
} from '../models/ticket';
import {
  invalidFirestoreDocument,
  normalizeNullableTimestamp,
  normalizeOptionalTimestamp,
  optionalNullableString,
  requireDocumentData,
  requireString,
  type FirestoreSnapshotLike,
} from './firestore-normalization';

function requireOneOf<T extends string>(
  value: unknown,
  supported: readonly T[],
  fieldName: string,
  documentId: string
): T {
  if (typeof value !== 'string' || !supported.includes(value as T)) {
    throw invalidFirestoreDocument(
      'query_tickets',
      documentId,
      `${fieldName} has an unsupported value`
    );
  }
  return value as T;
}

export function mapTicketDocument(snapshot: FirestoreSnapshotLike): Ticket {
  const data = requireDocumentData(snapshot, 'query_tickets');
  return {
    id: snapshot.id,
    refNumber: requireString(
      data.refNumber,
      'refNumber',
      'query_tickets',
      snapshot.id
    ),
    name: requireString(data.name, 'name', 'query_tickets', snapshot.id),
    email: requireString(data.email, 'email', 'query_tickets', snapshot.id),
    category: requireOneOf<TicketCategory>(
      data.category,
      ['general', 'bug', 'billing', 'partnership', 'other'],
      'category',
      snapshot.id
    ),
    message: requireString(data.message, 'message', 'query_tickets', snapshot.id),
    status: requireOneOf(data.status, ['open', 'resolved'], 'status', snapshot.id),
    submitterEmailStatus: requireOneOf<DeliveryStatus>(
      data.submitterEmailStatus,
      ['pending', 'sent', 'failed'],
      'submitterEmailStatus',
      snapshot.id
    ),
    adminEmailStatus: requireOneOf<DeliveryStatus>(
      data.adminEmailStatus,
      ['pending', 'sent', 'failed'],
      'adminEmailStatus',
      snapshot.id
    ),
    lastEmailError:
      optionalNullableString(
        data.lastEmailError,
        'lastEmailError',
        'query_tickets',
        snapshot.id
      ) ?? null,
    notificationUpdatedAt:
      normalizeNullableTimestamp(
        data.notificationUpdatedAt,
        'notificationUpdatedAt',
        'query_tickets',
        snapshot.id
      ) ?? null,
    createdAt: normalizeOptionalTimestamp(
      data.createdAt,
      'createdAt',
      'query_tickets',
      snapshot.id
    ),
    updatedAt: normalizeOptionalTimestamp(
      data.updatedAt,
      'updatedAt',
      'query_tickets',
      snapshot.id
    ),
  };
}

const firestoreTicketRepository: TicketRepository = {
  async create({ name, email, category, message }: TicketInput): Promise<Ticket> {
    const db = getDb();
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const counterRef = db.collection('counters').doc(`tickets-${datePart}`);

    const ticketId = randomUUID();
    await db.runTransaction(async (tx: Transaction) => {
      const counter = await tx.get(counterRef);
      const seq = ((counter.data()?.seq as number | undefined) ?? 0) + 1;
      const now = new Date().toISOString();
      const record: Ticket = {
        id: ticketId,
        refNumber: `SPR-${datePart}-${String(seq).padStart(4, '0')}`,
        name,
        email,
        category,
        message,
        status: 'open',
        submitterEmailStatus: 'pending',
        adminEmailStatus: 'pending',
        lastEmailError: null,
        notificationUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(counterRef, { seq }, { merge: true });
      tx.set(db.collection('query_tickets').doc(record.id), record);
    });
    const snapshot = await db.collection('query_tickets').doc(ticketId).get();
    return mapTicketDocument(snapshot);
  },

  async updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void> {
    await getDb().collection('query_tickets').doc(id).set(patch, { merge: true });
  },
};

export default firestoreTicketRepository;
