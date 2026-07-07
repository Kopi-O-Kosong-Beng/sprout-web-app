/** T05 — query ticket integration (tasks.md 18.4 head start).
 *  Uses a throwaway SQLite file (set in setup-env.ts) so dev data is never touched. */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../app';
import db from '../database/db';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
  const f = path.join(__dirname, '..', 'database', 'sprout.test.sqlite3');
  [f, `${f}-shm`, `${f}-wal`].forEach((p) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
});

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
    category: 'general',
    message: 'Hello Sprout team!',
  };

  it('creates a ticket, returns 201 + SPR-YYYYMMDD-NNNN, persists the row', async () => {
    const res = await request(app).post('/api/query/submit').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.refNumber).toMatch(/^SPR-\d{8}-\d{4}$/);

    const row = await db('query_tickets')
      .where({ refNumber: res.body.refNumber })
      .first();
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
});
