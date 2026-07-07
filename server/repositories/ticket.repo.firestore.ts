/** Firestore implementation of the ticket repository (final architecture).
 *  RefNumber sequence uses a per-day counter document inside a Firestore
 *  transaction — atomic under concurrency (Req 9.10), no duplicate numbers.
 */
import { randomUUID } from 'crypto';
import type { Transaction } from 'firebase-admin/firestore';
import { getDb } from '../firebase';
import type { Ticket, TicketInput, TicketRepository } from '../models/ticket';

const firestoreTicketRepository: TicketRepository = {
  async create({ name, email, category, message }: TicketInput): Promise<Ticket> {
    const db = getDb();
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const counterRef = db.collection('counters').doc(`tickets-${datePart}`);

    return db.runTransaction(async (tx: Transaction) => {
      const counter = await tx.get(counterRef);
      const seq = ((counter.data()?.seq as number | undefined) ?? 0) + 1;
      const now = new Date().toISOString();
      const record: Ticket = {
        id: randomUUID(),
        refNumber: `SPR-${datePart}-${String(seq).padStart(4, '0')}`,
        name,
        email,
        category,
        message,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };
      tx.set(counterRef, { seq }, { merge: true });
      tx.set(db.collection('query_tickets').doc(record.id), record);
      return record;
    });
  },
};

export default firestoreTicketRepository;
