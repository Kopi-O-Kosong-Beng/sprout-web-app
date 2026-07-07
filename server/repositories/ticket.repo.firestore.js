/** Firestore implementation of the ticket repository (final architecture).
 *  RefNumber sequence uses a per-day counter document inside a Firestore
 *  transaction — atomic under concurrency (Req 9.10), no duplicate numbers.
 */
const { randomUUID } = require('crypto');
const { getDb } = require('../firebase');

async function create({ name, email, category, message }) {
  const db = getDb();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.collection('counters').doc(`tickets-${datePart}`);

  return db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);
    const seq = (counter.exists ? counter.data().seq : 0) + 1;
    const now = new Date().toISOString();
    const record = {
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
}

module.exports = { create };
