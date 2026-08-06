/** T05 query ticket integration against the local Firestore Emulator. */
import request from 'supertest';
jest.mock('../services/email.service', () => ({ send: jest.fn() }));
import { send as sendEmail } from '../services/email.service';
import app from '../app';
import { getDb } from '../firebase';
import ticketRepository from '../repositories/tickets';
import { clearFirestore } from './firestore-test-utils';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

async function readTicketByReference(
  refNumber: string
): Promise<FirebaseFirestore.DocumentData | undefined> {
  const snapshot = await getDb()
    .collection('query_tickets')
    .where('refNumber', '==', refNumber)
    .limit(1)
    .get();
  return snapshot.empty ? undefined : snapshot.docs[0].data();
}

beforeEach(clearFirestore);

describe('GET /api/health', () => {
  it('returns ok with a timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('POST /api/query/submit (T05)', () => {
  const valid = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Test subject',
    category: 'general',
    message: 'Hello Sprout team!',
  };

  beforeEach(() => {
    mockSendEmail.mockReset();
  });

  it('creates a ticket, returns 201 + SPR-YYYYMMDD-NNNN, persists the row', async () => {
    const res = await request(app).post('/api/query/submit').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.refNumber).toMatch(/^SPR-\d{8}-\d{4}$/);

    const row = (await readTicketByReference(res.body.refNumber))!;
    expect(row).toBeDefined();
    expect(row.status).toBe('open');
    expect(row.email).toBe(valid.email);
  });

  it('increments the daily sequence and never duplicates (Req 9.10)', async () => {
    const r1 = await request(app).post('/api/query/submit').send(valid);
    const r2 = await request(app).post('/api/query/submit').send(valid);
    expect(r1.body.refNumber).not.toBe(r2.body.refNumber);
  });

  it('rejects a missing required field with 400 (Req 9.2)', async () => {
    const { email: _omitted, ...noEmail } = valid;
    const res = await request(app).post('/api/query/submit').send(noEmail);
    expect(res.status).toBe(400);
  });

  it('accepts the UC8 field set including an optional organisation', async () => {
    const res = await request(app)
      .post('/api/query/submit')
      .send({
        ...valid,
        organisation: 'SUTD',
        subject: 'Partnership enquiry',
        category: 'partnership',
      });

    expect(res.status).toBe(201);
    expect(res.body.refNumber).toMatch(/^SPR-\d{8}-\d{4}$/);
  });

  it.each(['general', 'partnership', 'technical_support', 'feedback'])(
    'accepts documented inquiry type %s',
    async (category) => {
      const res = await request(app)
        .post('/api/query/submit')
        .send({ ...valid, category });

      expect(res.status).toBe(201);
    }
  );

  it('requires a subject', async () => {
    const { subject: _omitted, ...noSubject } = valid;

    const res = await request(app).post('/api/query/submit').send(noSubject);

    expect(res.status).toBe(400);
  });

  it('rejects a subject longer than the documented limit', async () => {
    const res = await request(app)
      .post('/api/query/submit')
      .send({ ...valid, subject: 'x'.repeat(151) });

    expect(res.status).toBe(400);
  });

  it('treats organisation as optional, not required', async () => {
    const res = await request(app).post('/api/query/submit').send(valid);

    expect(res.status).toBe(201);
  });

  it('rejects an invalid category with 400 (Req 9.12)', async () => {
    const res = await request(app)
      .post('/api/query/submit')
      .send({ ...valid, category: 'nonsense' });
    expect(res.status).toBe(400);
  });

  it('rejects a message over 2000 chars with 400 (Req 9.11)', async () => {
    const res = await request(app)
      .post('/api/query/submit')
      .send({ ...valid, message: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed email with 400', async () => {
    const res = await request(app)
      .post('/api/query/submit')
      .send({ ...valid, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('UC8 alt-flow 5a: still returns 201 + persists when email delivery fails', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('delivery failed'));
    // The shared email service is mocked so this failure path stays deterministic.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).post('/api/query/submit').send(valid);
      expect(res.status).toBe(201);
      expect(res.body.refNumber).toMatch(/^SPR-\d{8}-\d{4}$/);

      const row = (await readTicketByReference(res.body.refNumber))!;
      expect(row).toBeDefined();
      expect(
        errSpy.mock.calls.flat().join('\n')
      ).toContain('email delivery failed');
    } finally {
      errSpy.mockRestore();
    }
  });

  it.each([
    ['submitter fails', [new Error('submitter failed'), { delivered: true, mode: 'smtp' }]],
    ['admin fails', [{ delivered: true, mode: 'smtp' }, new Error('admin failed')]],
    ['both fail', [new Error('submitter failed'), new Error('admin failed')]],
  ])('persists and attempts both notifications when %s', async (_label, outcomes) => {
    const previousAdminEmail = process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_EMAIL;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const outcome of outcomes) {
        if (outcome instanceof Error) mockSendEmail.mockRejectedValueOnce(outcome);
        else mockSendEmail.mockResolvedValueOnce(outcome);
      }

      const res = await request(app).post('/api/query/submit').send(valid);

      expect(res.status).toBe(201);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      expect(mockSendEmail.mock.calls[1][0].to).toBe('hello.sprout.team@gmail.com');
      const row = (await readTicketByReference(res.body.refNumber))!;
      expect(row).toMatchObject({
        submitterEmailStatus: outcomes[0] instanceof Error ? 'failed' : 'sent',
        adminEmailStatus: outcomes[1] instanceof Error ? 'failed' : 'sent',
        lastEmailError: outcomes[0] instanceof Error
          ? outcomes[1] instanceof Error
            ? 'submitter_email_delivery_failed;admin_email_delivery_failed'
            : 'submitter_email_delivery_failed'
          : 'admin_email_delivery_failed',
      });
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ticket] email delivery failed'),
        expect.any(String)
      );
    } finally {
      if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = previousAdminEmail;
      errSpy.mockRestore();
    }
  });

  it('never persists or logs secret-bearing provider rejection text', async () => {
    const submitterSecret = 'smtp-password=submitter-secret';
    const adminSecret = 'provider-token=admin-secret';
    mockSendEmail
      .mockRejectedValueOnce(new Error(submitterSecret))
      .mockRejectedValueOnce(new Error(adminSecret));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await request(app).post('/api/query/submit').send(valid);
      expect(res.status).toBe(201);
      const row = (await readTicketByReference(res.body.refNumber))!;
      expect(row.lastEmailError).toBe(
        'submitter_email_delivery_failed;admin_email_delivery_failed'
      );
      const output = errSpy.mock.calls.flat().join('\n');
      expect(output).toContain('submitter_email_delivery_failed');
      expect(output).toContain('admin_email_delivery_failed');
      expect(output).not.toContain(submitterSecret);
      expect(output).not.toContain(adminSecret);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('never logs raw notification-state persistence errors', async () => {
    const secret = 'database-url=secret-persistence-value';
    mockSendEmail.mockResolvedValue({ delivered: true, mode: 'smtp' });
    const updateSpy = jest
      .spyOn(ticketRepository, 'updateNotificationState')
      .mockRejectedValueOnce(new Error(secret));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await request(app).post('/api/query/submit').send(valid);
      expect(res.status).toBe(201);
      const output = errSpy.mock.calls.flat().join('\n');
      expect(output).toContain('notification_status_update_failed');
      expect(output).not.toContain(secret);
    } finally {
      updateSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

/** The Contact page's "Check Feedback Status" lookup. */
describe('POST /api/query/status', () => {
  const valid = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Account help',
    category: 'general',
    message: 'Hello Sprout team!',
  };

  beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ delivered: true, mode: 'console' });
  });

  async function submitTicket(): Promise<string> {
    const res = await request(app).post('/api/query/submit').send(valid);
    expect(res.status).toBe(201);
    return res.body.refNumber as string;
  }

  it('returns the ticket to the address that filed it', async () => {
    const refNumber = await submitTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber, email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      refNumber,
      subject: 'Account help',
      category: 'general',
      status: 'open',
    });
    expect(typeof res.body.submittedAt).toBe('string');
  });

  it('matches the reference number and email case-insensitively', async () => {
    const refNumber = await submitTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: refNumber.toLowerCase(), email: 'ADA@Example.com' });

    expect(res.status).toBe(200);
    expect(res.body.refNumber).toBe(refNumber);
  });

  /* The reference number is a per-day counter, so it is guessable. Only the
     email proves the ticket is yours. */
  it('refuses a real reference number paired with the wrong email', async () => {
    const refNumber = await submitTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber, email: 'someone.else@example.com' });

    expect(res.status).toBe(404);
  });

  /* Same status and same wording for "not yours" and "does not exist" — a
     different response to either would turn the form into an oracle for which
     reference numbers have been issued. */
  it('answers an unknown reference exactly as it answers a wrong email', async () => {
    const refNumber = await submitTicket();

    const wrongEmail = await request(app)
      .post('/api/query/status')
      .send({ refNumber, email: 'someone.else@example.com' });
    const unknownRef = await request(app)
      .post('/api/query/status')
      .send({ refNumber: 'SPR-20200101-9999', email: 'ada@example.com' });

    expect(unknownRef.status).toBe(wrongEmail.status);
    expect(unknownRef.body).toEqual(wrongEmail.body);
  });

  it('never returns the message body or the reporter name', async () => {
    const refNumber = await submitTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber, email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Hello Sprout team!');
    expect(res.body.name).toBeUndefined();
    expect(res.body.email).toBeUndefined();
  });

  it('rejects a malformed reference number with 400', async () => {
    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: 'not-a-reference', email: 'ada@example.com' });

    expect(res.status).toBe(400);
  });

  it('rejects a missing email with 400', async () => {
    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: 'SPR-20260712-0001' });

    expect(res.status).toBe(400);
  });
});

/**
 * Public status check — the other half of the Contact page. The submitter
 * proves ownership with the email they filed under, so no account is needed.
 *
 * Reference numbers are a daily sequence (SPR-YYYYMMDD-NNNN) and therefore
 * guessable, which is why the email is required and why a wrong pairing must
 * be indistinguishable from a reference that does not exist.
 */
describe('POST /api/query/status', () => {
  async function fileTicket() {
    return ticketRepository.create({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Scan failed on a fern',
      category: 'general',
      message: 'The camera returned nothing.',
    });
  }

  it('returns the status to the submitter', async () => {
    const ticket = await fileTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: ticket.refNumber, email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      refNumber: ticket.refNumber,
      subject: 'Scan failed on a fern',
      status: 'open',
      resolvedAt: null,
    });
  });

  /* Never the message body, the reporter's name, or the email bookkeeping —
   * this endpoint is unauthenticated. */
  it('discloses only the status fields, not the ticket contents', async () => {
    const ticket = await fileTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: ticket.refNumber, email: 'ada@example.com' });

    expect(Object.keys(res.body).sort()).toEqual([
      'category',
      'refNumber',
      'resolvedAt',
      'status',
      'subject',
      'submittedAt',
    ]);
  });

  it('accepts the reference in any case and with surrounding space', async () => {
    const ticket = await fileTicket();

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: `  ${ticket.refNumber.toLowerCase()} `, email: 'ADA@example.com' });

    expect(res.status).toBe(200);
  });

  /* One identical answer for both, so the form cannot be used to discover
   * which reference numbers exist. */
  it('answers the same 404 for a wrong email as for an unknown reference', async () => {
    const ticket = await fileTicket();

    const wrongEmail = await request(app)
      .post('/api/query/status')
      .send({ refNumber: ticket.refNumber, email: 'someone@else.com' });
    const unknownRef = await request(app)
      .post('/api/query/status')
      .send({ refNumber: 'SPR-20260101-9999', email: 'ada@example.com' });

    expect(wrongEmail.status).toBe(404);
    expect(unknownRef.status).toBe(404);
    expect(wrongEmail.body).toEqual(unknownRef.body);
  });

  it('rejects a malformed reference number before touching the database', async () => {
    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: 'not-a-reference', email: 'ada@example.com' });

    expect(res.status).toBe(400);
  });

  it('requires both fields', async () => {
    await expect(
      request(app).post('/api/query/status').send({ refNumber: 'SPR-20260101-0001' })
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      request(app).post('/api/query/status').send({ email: 'ada@example.com' })
    ).resolves.toMatchObject({ status: 400 });
  });

  /* The reply date the Contact page shows. It is stamped by the operator's
   * resolve, so it must appear here only after one. */
  it('reports resolvedAt once an operator has resolved the ticket', async () => {
    const ticket = await fileTicket();
    await ticketRepository.setStatus(ticket.id, 'resolved');

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: ticket.refNumber, email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(Number.isNaN(Date.parse(res.body.resolvedAt))).toBe(false);
  });

  it('clears resolvedAt again when the ticket is reopened', async () => {
    const ticket = await fileTicket();
    await ticketRepository.setStatus(ticket.id, 'resolved');
    await ticketRepository.setStatus(ticket.id, 'open');

    const res = await request(app)
      .post('/api/query/status')
      .send({ refNumber: ticket.refNumber, email: 'ada@example.com' });

    expect(res.body).toMatchObject({ status: 'open', resolvedAt: null });
  });
});
