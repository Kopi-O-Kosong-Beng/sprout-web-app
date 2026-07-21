import { getDb } from '../firebase';
import ticketRepository from '../repositories/tickets';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore ticket repository', () => {
  beforeEach(clearFirestore);

  it('creates tickets with initial pending notification state in a transaction', async () => {
    const ticket = await ticketRepository.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
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
      category: 'general' as const,
      message: 'Hello Sprout team!',
    };

    const [first, second] = await Promise.all([
      ticketRepository.create(input),
      ticketRepository.create(input),
    ]);

    expect(new Set([first.refNumber, second.refNumber]).size).toBe(2);
  });
});
