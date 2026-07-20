const mockTransactionGet = jest.fn(async () => ({
  data: () => ({ seq: 0 }),
}));
const mockTransactionSet = jest.fn();
const mockTransaction = {
  get: mockTransactionGet,
  set: mockTransactionSet,
};
const mockRunTransaction = jest.fn(async (callback: (tx: typeof mockTransaction) => unknown) => {
  return callback(mockTransaction);
});
const mockCollection = jest.fn((collectionName: string) => ({
  doc: (id: string) => ({ collectionName, id }),
}));
const mockDb = {
  collection: mockCollection,
  runTransaction: mockRunTransaction,
};

jest.mock('../firebase', () => ({
  getDb: () => mockDb,
}));

import firestoreTicketRepository from '../repositories/ticket.repo.firestore';

describe('Firestore ticket repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates tickets with initial pending notification state in the transaction', async () => {
    const ticket = await firestoreTicketRepository.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      category: 'general',
      message: 'Hello Sprout team!',
    });

    const ticketWrite = mockTransactionSet.mock.calls.find(
      ([ref]) => ref.collectionName === 'query_tickets'
    );
    expect(ticketWrite).toBeDefined();
    expect(ticketWrite?.[1]).toMatchObject({
      id: ticket.id,
      submitterEmailStatus: 'pending',
      adminEmailStatus: 'pending',
      lastEmailError: null,
      notificationUpdatedAt: null,
    });
  });
});
