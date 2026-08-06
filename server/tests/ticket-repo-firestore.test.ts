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

  /* The reply timestamp the submitter is shown on the Contact page's status
   * check. It has to be cleared on reopen: a ticket back in the queue that
   * still advertised a reply date would be telling the submitter they had been
   * answered when they had not. */
  it('stamps resolvedAt on resolve and clears it on reopen', async () => {
    const created = await ticketRepository.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Test subject',
      category: 'general',
      message: 'Hello Sprout team!',
    });
    expect(created.resolvedAt ?? null).toBeNull();

    const resolved = await ticketRepository.setStatus(created.id, 'resolved');
    expect(resolved?.status).toBe('resolved');
    expect(typeof resolved?.resolvedAt).toBe('string');
    expect(Number.isNaN(Date.parse(resolved!.resolvedAt!))).toBe(false);

    const reopened = await ticketRepository.setStatus(created.id, 'open');
    expect(reopened?.status).toBe('open');
    expect(reopened?.resolvedAt ?? null).toBeNull();
  });

  /* Regression: three tickets written on 2026-07-12 predate the notification
   * fields entirely. requireOneOf rejected `undefined`, and because the Ticket
   * Manager decodes the whole collection in one pass, those three turned the
   * operator's queue into a 500 — 21 healthy tickets unreachable behind them. */
  it('decodes tickets stored before notification tracking existed', async () => {
    const reference = getDb().collection('query_tickets').doc('legacy-ticket');
    await reference.set({
      refNumber: 'SPR-20260712-0003',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      category: 'general',
      message: 'Filed before the delivery fields were added.',
      status: 'open',
      // No submitterEmailStatus, adminEmailStatus or subject.
    });

    await expect(reference.get().then(mapTicketDocument)).resolves.toMatchObject({
      refNumber: 'SPR-20260712-0003',
      subject: '',
      // 'pending' is the honest reading of "nothing was ever recorded", and
      // the same state a new ticket starts in.
      submitterEmailStatus: 'pending',
      adminEmailStatus: 'pending',
    });
  });

  /* Absence is forgiven; a wrong value is not. Rewriting a corrupt delivery
   * state to 'pending' would hide a bad write behind a plausible default. */
  it('still rejects a delivery status that is present but unrecognised', async () => {
    const reference = getDb().collection('query_tickets').doc('corrupt-status');
    await reference.set({
      refNumber: 'SPR-20260712-0009',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Test subject',
      category: 'general',
      message: 'Hello Sprout team!',
      status: 'open',
      submitterEmailStatus: 'delivered',
      adminEmailStatus: 'pending',
    });

    await expect(reference.get().then(mapTicketDocument)).rejects.toThrow(
      'submitterEmailStatus has an unsupported value'
    );
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
