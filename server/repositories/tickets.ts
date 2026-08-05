/** Firebase Admin implementation of the ticket repository.
 *  RefNumber sequence uses a per-day counter document inside a Firestore
 *  transaction — atomic under concurrency (Req 9.10), no duplicate numbers.
 */
import { randomUUID } from 'crypto';
import type { Transaction } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import { TICKET_CATEGORIES } from '../models/ticket';
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

/** Delivery bookkeeping, for documents that may predate it.
 *
 *  `submitterEmailStatus` / `adminEmailStatus` were added with the notification
 *  tracking; tickets stored before that carry neither. Absent decodes to
 *  'pending', which is the honest reading — nothing was ever recorded — and the
 *  same value a new ticket starts at.
 *
 *  Only *absent* is forgiven. A field that is present but holds something other
 *  than the three known states is a real data defect and still throws, exactly
 *  as before; silently rewriting it to 'pending' would hide a corrupt write.
 */
function optionalDeliveryStatus(
  value: unknown,
  fieldName: string,
  documentId: string
): DeliveryStatus {
  if (value === undefined || value === null) return 'pending';
  return requireOneOf<DeliveryStatus>(
    value,
    ['pending', 'sent', 'failed'],
    fieldName,
    documentId
  );
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
    // Tickets stored before the form was realigned to UC8 have no
    // organisation/subject, so both decode leniently.
    organisation:
      optionalNullableString(
        data.organisation,
        'organisation',
        'query_tickets',
        snapshot.id
      ) ?? undefined,
    subject:
      optionalNullableString(data.subject, 'subject', 'query_tickets', snapshot.id) ??
      '',
    category: requireOneOf<TicketCategory>(
      data.category,
      TICKET_CATEGORIES,
      'category',
      snapshot.id
    ),
    message: requireString(data.message, 'message', 'query_tickets', snapshot.id),
    status: requireOneOf(data.status, ['open', 'resolved'], 'status', snapshot.id),
    submitterEmailStatus: optionalDeliveryStatus(
      data.submitterEmailStatus,
      'submitterEmailStatus',
      snapshot.id
    ),
    adminEmailStatus: optionalDeliveryStatus(
      data.adminEmailStatus,
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
    // Absent on every ticket resolved before this was tracked, which decodes
    // to null — the status check then reports "Resolved" with no date rather
    // than claiming a reply happened at a time nobody recorded.
    resolvedAt:
      normalizeNullableTimestamp(
        data.resolvedAt,
        'resolvedAt',
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
  async create({
    name,
    email,
    organisation,
    subject,
    category,
    message,
  }: TicketInput): Promise<Ticket> {
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
        // Firestore rejects undefined; an omitted organisation stores as ''.
        organisation: organisation?.trim() ? organisation.trim() : '',
        subject,
        category,
        message,
        status: 'open',
        submitterEmailStatus: 'pending',
        adminEmailStatus: 'pending',
        lastEmailError: null,
        notificationUpdatedAt: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(counterRef, { seq }, { merge: true });
      tx.set(db.collection('query_tickets').doc(record.id), record);
    });
    const snapshot = await db.collection('query_tickets').doc(ticketId).get();
    return mapTicketDocument(snapshot);
  },

  async findByRefNumber(refNumber: string): Promise<Ticket | null> {
    const snapshot = await getDb()
      .collection('query_tickets')
      .where('refNumber', '==', refNumber)
      .limit(1)
      .get();
    return snapshot.empty ? null : mapTicketDocument(snapshot.docs[0]);
  },

  async list(): Promise<Ticket[]> {
    // Sorted in memory rather than with orderBy: createdAt is absent on the
    // oldest documents, and a Firestore orderBy silently drops rows that lack
    // the field — the Ticket Manager would then hide exactly the tickets that
    // have been waiting longest.
    const snapshot = await getDb().collection('query_tickets').get();
    return snapshot.docs
      .map((doc) => mapTicketDocument(doc))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  },

  async setStatus(id: string, status: Ticket['status']): Promise<Ticket | null> {
    const ref = getDb().collection('query_tickets').doc(id);
    const existing = await ref.get();
    if (!existing.exists) return null;
    const now = new Date().toISOString();
    await ref.set(
      {
        status,
        // Stamped when an operator resolves, cleared when they reopen: a
        // ticket back in the queue must not still show the submitter a date
        // Sprout supposedly replied on.
        resolvedAt: status === 'resolved' ? now : null,
        updatedAt: now,
      },
      { merge: true }
    );
    return mapTicketDocument(await ref.get());
  },

  async updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void> {
    await getDb().collection('query_tickets').doc(id).set(patch, { merge: true });
  },
};

export default firestoreTicketRepository;
