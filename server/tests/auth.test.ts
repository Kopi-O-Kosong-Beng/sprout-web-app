import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../app';
import db from '../database/db';

interface MockFirebaseUser {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  password?: string;
}

const mockUsersByEmail = new Map<string, MockFirebaseUser>();
const mockUsersByUid = new Map<string, MockFirebaseUser>();

const mockAuthAdmin = {
  createUser: jest.fn(async (input: {
    uid?: string;
    email: string;
    password: string;
    displayName?: string;
    emailVerified?: boolean;
  }) => {
    const email = input.email.toLowerCase();
    if (mockUsersByEmail.has(email)) {
      const err = new Error('duplicate') as Error & { code: string };
      err.code = 'auth/email-already-exists';
      throw err;
    }
    const user: MockFirebaseUser = {
      uid: input.uid ?? randomUUID(),
      email,
      displayName: input.displayName,
      emailVerified: input.emailVerified ?? false,
      password: input.password,
    };
    mockUsersByEmail.set(email, user);
    mockUsersByUid.set(user.uid, user);
    return user;
  }),
  getUser: jest.fn(async (uid: string) => {
    const user = mockUsersByUid.get(uid);
    if (!user) {
      const err = new Error('not found') as Error & { code: string };
      err.code = 'auth/user-not-found';
      throw err;
    }
    return user;
  }),
  getUserByEmail: jest.fn(async (emailInput: string) => {
    const user = mockUsersByEmail.get(emailInput.toLowerCase());
    if (!user) {
      const err = new Error('not found') as Error & { code: string };
      err.code = 'auth/user-not-found';
      throw err;
    }
    return user;
  }),
  updateUser: jest.fn(async (uid: string, data: Partial<MockFirebaseUser>) => {
    const user = mockUsersByUid.get(uid);
    if (!user) {
      const err = new Error('not found') as Error & { code: string };
      err.code = 'auth/user-not-found';
      throw err;
    }
    const updated = { ...user, ...data };
    mockUsersByUid.set(uid, updated);
    mockUsersByEmail.set(updated.email.toLowerCase(), updated);
    return updated;
  }),
  generateEmailVerificationLink: jest.fn(async (email: string) => {
    return `https://example.test/verify?email=${encodeURIComponent(email)}`;
  }),
  verifyIdToken: jest.fn(),
};

jest.mock('../firebase', () => ({
  getAuthAdmin: () => mockAuthAdmin,
}));

async function resetTables(): Promise<void> {
  await db('query_tickets').del();
  await db('battle_sessions').del();
  await db('avatar_records').del();
  await db('password_history').del();
  await db('users').del();
}

async function createLocalUser(input: {
  id?: string;
  email: string;
  password?: string;
  displayName?: string;
  isVerified?: boolean;
}): Promise<{ id: string; email: string; password: string }> {
  const id = input.id ?? randomUUID();
  const password = input.password ?? 'Password123!';
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  await db('users').insert({
    id,
    email,
    passwordHash,
    displayName: input.displayName ?? 'Test User',
    isVerified: input.isVerified ?? true,
  });
  await db('password_history').insert({
    id: randomUUID(),
    userId: id,
    passwordHash,
    changedAt: new Date().toISOString(),
  });
  const firebaseUser: MockFirebaseUser = {
    uid: id,
    email,
    displayName: input.displayName ?? 'Test User',
    emailVerified: input.isVerified ?? true,
    password,
  };
  mockUsersByEmail.set(email, firebaseUser);
  mockUsersByUid.set(id, firebaseUser);
  return { id, email, password };
}

function latestOtpFromConsole(spy: jest.SpyInstance): string {
  const text = spy.mock.calls.flat().join('\n');
  const match = text.match(/\b\d{6}\b/);
  if (!match) throw new Error(`No OTP found in console output: ${text}`);
  return match[0];
}

beforeAll(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  mockUsersByEmail.clear();
  mockUsersByUid.clear();
  jest.clearAllMocks();
  await resetTables();
});

afterAll(async () => {
  await db.destroy();
  const f = path.join(__dirname, '..', 'database', 'sprout.test.sqlite3');
  [f, `${f}-shm`, `${f}-wal`, `${f}-journal`].forEach((p) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
});

describe('POST /api/auth/signup', () => {
  it('creates a Firebase user, local profile, password history, and email log', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await request(app).post('/api/auth/signup').send({
      email: 'Ada@Example.com',
      password: 'Password123!',
      displayName: 'Ada',
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('ada@example.com');
    expect(res.body.emailVerified).toBe(false);
    expect(mockAuthAdmin.generateEmailVerificationLink).toHaveBeenCalledWith(
      'ada@example.com'
    );

    const row = await db('users').where({ id: res.body.uid }).first();
    expect(row).toBeDefined();
    expect(row.passwordHash).not.toBe('Password123!');
    expect(await bcrypt.compare('Password123!', row.passwordHash)).toBe(true);

    const history = await db('password_history').where({ userId: res.body.uid });
    expect(history).toHaveLength(1);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('https://example.test/verify');
    logSpy.mockRestore();
  });

  it('rejects duplicate email with 409', async () => {
    const payload = {
      email: 'dup@example.com',
      password: 'Password123!',
      displayName: 'Duplicate',
    };
    expect((await request(app).post('/api/auth/signup').send(payload)).status).toBe(
      201
    );

    const res = await request(app).post('/api/auth/signup').send(payload);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('An account with this email already exists.');
  });

  it('rejects malformed email and weak password with 400', async () => {
    const badEmail = await request(app).post('/api/auth/signup').send({
      email: 'not-an-email',
      password: 'Password123!',
      displayName: 'Bad',
    });
    expect(badEmail.status).toBe(400);

    const weakPassword = await request(app).post('/api/auth/signup').send({
      email: 'weak@example.com',
      password: 'password',
      displayName: 'Weak',
    });
    expect(weakPassword.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the verified user profile for a valid Firebase ID token', async () => {
    const user = await createLocalUser({
      email: 'verified@example.com',
      isVerified: false,
    });
    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: user.id,
      email: user.email,
      email_verified: true,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.uid).toBe(user.id);
    expect(res.body.emailVerified).toBe(true);
    const row = await db('users').where({ id: user.id }).first();
    expect(Boolean(row.isVerified)).toBe(true);
  });

  it('rejects missing, invalid, and unverified tokens', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    mockAuthAdmin.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const invalid = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer bad-token');
    expect(invalid.status).toBe(401);

    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: 'pending-user',
      email: 'pending@example.com',
      email_verified: false,
    });
    const unverified = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer pending-token');
    expect(unverified.status).toBe(403);
    expect(unverified.body.error).toBe('Email is not verified.');
  });
});

describe('password reset OTP flow', () => {
  it('returns 200 for known and unknown emails without leaking account existence', async () => {
    await createLocalUser({ email: 'reset@example.com' });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const known = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'reset@example.com' });
    const unknown = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'unknown@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);

    const row = await db('users').where({ email: 'reset@example.com' }).first();
    expect(row.resetOtpHash).toBeTruthy();
    expect(row.resetOtpHash).not.toBe(latestOtpFromConsole(logSpy));
    logSpy.mockRestore();
  });

  it('resets a password with a valid OTP and clears the stored OTP', async () => {
    const user = await createLocalUser({ email: 'success@example.com' });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await request(app)
      .post('/api/auth/request-reset')
      .send({ email: user.email });
    const otp = latestOtpFromConsole(logSpy);

    const res = await request(app).post('/api/auth/verify-reset').send({
      email: user.email,
      otp,
      newPassword: 'Password123!!',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password reset successful.');
    expect(mockAuthAdmin.updateUser).toHaveBeenCalledWith(user.id, {
      password: 'Password123!!',
    });

    const row = await db('users').where({ id: user.id }).first();
    expect(row.resetOtpHash).toBeNull();
    expect(await bcrypt.compare('Password123!!', row.passwordHash)).toBe(true);
    logSpy.mockRestore();
  });

  it('rejects invalid OTP, expired OTP, weak password, and recent reuse', async () => {
    const user = await createLocalUser({ email: 'reject@example.com' });
    const otpHash = await bcrypt.hash('123456', 12);
    await db('users').where({ id: user.id }).update({
      resetOtpHash: otpHash,
      resetOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    const invalid = await request(app).post('/api/auth/verify-reset').send({
      email: user.email,
      otp: '000000',
      newPassword: 'Password123!!',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('Invalid OTP.');

    const weak = await request(app).post('/api/auth/verify-reset').send({
      email: user.email,
      otp: '123456',
      newPassword: 'password',
    });
    expect(weak.status).toBe(400);

    const reused = await request(app).post('/api/auth/verify-reset').send({
      email: user.email,
      otp: '123456',
      newPassword: user.password,
    });
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe(
      'This password was used recently. Choose a different password.'
    );

    await db('users').where({ id: user.id }).update({
      resetOtpHash: otpHash,
      resetOtpExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expired = await request(app).post('/api/auth/verify-reset').send({
      email: user.email,
      otp: '123456',
      newPassword: 'Password123!!',
    });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('OTP has expired. Request a new one.');
  });
});
