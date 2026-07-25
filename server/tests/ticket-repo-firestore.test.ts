import { getDb } from '../firebase';
import { Timestamp } from 'firebase-admin/firestore';
import ticketRepository, { mapTicketDocument } from '../repositories/tickets';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore ticket repository', () => {
  beforeEach(clearFirestore);

  it('creates tickets with initial pending notification state in a transaction', async () => {
    const ticket = await ticketRepository.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Test subject',
      category: 'general',
      message: 'Hello Sprout team!',
    });

    const document = await getDb().collection('query_tickets').doc(ticket.id).get();
    expect(document.exists).toBe(true);
    expect(document.data()).toMatchObject({
      id: ticket.id,
      refNumber: ticket.refNumber,
      submitterEmailStatus: 'pending',
      adminEmailStatus: 'pending',
      lastEmailError: null,
      notificationUpdatedAt: null,
    });
  });

  it('increments the daily counter atomically', async () => {
    const input = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Test subject',
      category: 'general' as const,
      message: 'Hello Sprout team!',
    };

    const [first, second] = await Promise.all([
      ticketRepository.create(input),
      ticketRepository.create(input),
    ]);

    expect(new Set([first.refNumber, second.refNumber]).size).toBe(2);
  });

  it('derives ticket IDs from paths and normalizes Firestore timestamps', async () => {
    const createdAt = new Date('2026-07-20T01:00:00.000Z');
    const updatedAt = new Date('2026-07-21T02:00:00.000Z');
    const notificationUpdatedAt = new Date('2026-07-22T03:00:00.000Z');
    const reference = getDb().collection('query_tickets').doc('path-ticket');
    await reference.set({
      refNumber: 'SPR-20260722-0001',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Test subject',
      category: 'general',
      message: 'Hello Sprout team!',
      status: 'open',
      submitterEmailStatus: 'sent',
      adminEmailStatus: 'pending',
      lastEmailError: null,
      notificationUpdatedAt: Timestamp.fromDate(notificationUpdatedAt),
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt,
    });

    await expect(reference.get().then(mapTicketDocument)).resolves.toMatchObject({
      id: 'path-ticket',
      notificationUpdatedAt: notificationUpdatedAt.toISOString(),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('rejects malformed required ticket fields with a controlled error', async () => {
    const reference = getDb().collection('query_tickets').doc('malformed-ticket');
    await reference.set({
      name: 'Missing Reference',
      email: 'ada@example.com',
      subject: 'Test subject',
      category: 'general',
      message: 'Hello Sprout team!',
      status: 'open',
      submitterEmailStatus: 'pending',
      adminEmailStatus: 'pending',
      lastEmailError: null,
      notificationUpdatedAt: null,
    });

    await expect(reference.get().then(mapTicketDocument)).rejects.toThrow(
      'Invalid Firestore query_tickets document malformed-ticket: refNumber must be a non-empty string.'
    );
  });
});
