/** SQLite implementation of the ticket repository (dev fallback / tests). */
import { randomUUID } from 'crypto';
import db from '../database/db';
import type {
  Ticket,
  TicketInput,
  TicketNotificationPatch,
  TicketRepository,
} from '../models/ticket';

/** Creates a ticket with an atomic daily-sequence RefNumber (Req 9.5/9.10). */
const sqliteTicketRepository: TicketRepository = {
  async create({ name, email, category, message }: TicketInput): Promise<Ticket> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return db.transaction(async (trx) => {
      const row = await trx('query_tickets')
        .where('refNumber', 'like', `SPR-${datePart}-%`)
        .count({ n: '*' })
        .first<{ n: number | string }>();
      const seq = String(Number(row?.n ?? 0) + 1).padStart(4, '0');
      const record: Ticket = {
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
  },

  async updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void> {
    await db('query_tickets').where({ id }).update(patch);
  },
};

export default sqliteTicketRepository;
