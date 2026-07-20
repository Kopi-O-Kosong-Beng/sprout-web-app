import fs from 'fs';
import path from 'path';
import db from '../database/db';
import sqliteTicketRepository from '../repositories/ticket.repo.sqlite';

beforeAll(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  await db('query_tickets').del();
});

afterAll(async () => {
  await db.destroy();
  const filename = path.join(__dirname, '..', 'database', 'sprout.test.sqlite3');
  [filename, `${filename}-shm`, `${filename}-wal`].forEach((candidate) => {
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  });
});

describe('SQLite ticket repository', () => {
  it('returns and persists tickets with initial pending notification state', async () => {
    const ticket = await sqliteTicketRepository.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      category: 'general',
      message: 'Hello Sprout team!',
    });
    const row = await db('query_tickets').where({ id: ticket.id }).first();

    const initialNotificationState = {
      submitterEmailStatus: 'pending',
      adminEmailStatus: 'pending',
      lastEmailError: null,
      notificationUpdatedAt: null,
    };
    expect({ ticket, row }).toMatchObject({
      ticket: initialNotificationState,
      row: initialNotificationState,
    });
  });
});
