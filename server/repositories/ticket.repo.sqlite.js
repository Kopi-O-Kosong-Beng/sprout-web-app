/** SQLite implementation of the ticket repository (dev fallback / tests). */
const { randomUUID } = require('crypto');
const db = require('../database/db');

/** Creates a ticket with an atomic daily-sequence RefNumber (Req 9.5/9.10). */
async function create({ name, email, category, message }) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return db.transaction(async (trx) => {
    const row = await trx('query_tickets')
      .where('refNumber', 'like', `SPR-${datePart}-%`)
      .count({ n: '*' })
      .first();
    const seq = String(Number(row.n) + 1).padStart(4, '0');
    const record = {
      id: randomUUID(),
      refNumber: `SPR-${datePart}-${seq}`,
      name,
      email,
      category,
      message,
      status: 'open',
    };
    await trx('query_tickets').insert(record);
    return record;
  });
}

module.exports = { create };
