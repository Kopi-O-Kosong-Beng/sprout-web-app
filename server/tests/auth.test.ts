import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import request from 'supertest';
jest.mock('../services/email.service', () => ({ send: jest.fn() }));
import { send as sendEmail } from '../services/email.service';
import app from '../app';
import { getDb } from '../firebase';
import authUserRepository from '../repositories/auth-users';
import { clearFirestore } from './firestore-test-utils';
import {
  verificationResendAccountStore,
  verificationResendIpStore,
} from '../routes/auth.routes';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

interface MockFirebaseUser {
  uid: string;
  email?: string;
  displayName?: string;
  emailVerified: boolean;
  password?: string;
  /** What Firebase reports as linked to the account. The service reads this to
   *  decide whether an account is Google-only; absent means password. */
  providerData?: { providerId: string }[];
  metadata?: {
    lastSignInTime?: string;
  };
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
    if (updated.email) mockUsersByEmail.set(updated.email.toLowerCase(), updated);
    return updated;
  }),
  generateEmailVerificationLink: jest.fn(async () =>
    'https://sprout-dev-66f08.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=test-code&apiKey=test-key'
  ),
  verifyIdToken: jest.fn(),
};

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

async function readUserById(id: string): Promise<FirebaseFirestore.DocumentData | undefined> {
  const document = await getDb().collection('users').doc(id).get();
  return document.exists ? document.data() : undefined;
}

async function readUserByEmail(
  email: string
): Promise<FirebaseFirestore.DocumentData | undefined> {
  const snapshot = await getDb()
    .collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();
  return snapshot.empty ? undefined : snapshot.docs[0].data();
}

async function readPasswordHistory(
  userId: string
): Promise<FirebaseFirestore.DocumentData[]> {
  const snapshot = await getDb()
    .collection('password_history')
    .where('userId', '==', userId)
    .get();
  return snapshot.docs.map((document) => document.data());
}

async function updateUser(
  id: string,
  patch: FirebaseFirestore.DocumentData
): Promise<void> {
  await getDb().collection('users').doc(id).set(patch, { merge: true });
}

async function deletePasswordHistory(userId: string): Promise<void> {
  const snapshot = await getDb()
    .collection('password_history')
    .where('userId', '==', userId)
    .get();
  const batch = getDb().batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
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
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_COST));
  await authUserRepository.createProfile({
    id,
    email,
    passwordHash,
    displayName: input.displayName ?? 'Test User',
    isVerified: input.isVerified ?? true,
  });
  await authUserRepository.addPasswordHistory(id, passwordHash);
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

function latestOtpFromEmailPayload(): string {
  const text = mockSendEmail.mock.calls.at(-1)?.[0].text;
  const match = text?.match(/\b\d{6}\b/);
  if (!match) throw new Error('No OTP found in the email adapter payload.');
  return match[0];
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  mockUsersByEmail.clear();
  mockUsersByUid.clear();
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue({ delivered: true, mode: 'console' });
  await verificationResendAccountStore.resetAll();
  await verificationResendIpStore.resetAll();
  await clearFirestore();
});

describe('POST /api/auth/signup', () => {
  it('creates a Firebase user, local profile, and email payload without initial password history', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'Ada@Example.com',
      password: 'Password123!',
      displayName: 'Ada',
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('ada@example.com');
    expect(res.body.emailVerified).toBe(false);
    expect(mockAuthAdmin.generateEmailVerificationLink).toHaveBeenCalledWith(
      'ada@example.com',
      {
        url: 'http://localhost:5173/verify-email',
        handleCodeInApp: false,
      }
    );

    const row = (await readUserById(res.body.uid))!;
    expect(row).toBeDefined();
    expect(row.passwordHash).not.toBe('Password123!');
    expect(await bcrypt.compare('Password123!', row.passwordHash)).toBe(true);

    const history = await readPasswordHistory(res.body.uid);
    expect(history).toHaveLength(0);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Verify your Sprout account',
        text: expect.stringContaining('http://localhost:5173/verify-email'),
      })
    );
  });

  it('keeps the account and reports recovery when email delivery fails during signup', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('delivery failed'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app).post('/api/auth/signup').send({
        email: 'smtp-failure@example.com',
        password: 'Password123!',
        displayName: 'Smtp Failure',
      });
      expect(res.status).toBe(201);
      expect(res.body.verificationEmailSent).toBe(false);
      expect(res.body.message).toBe(
        'Account created, but the verification email could not be sent. Sign in and request a new link.'
      );
      expect(
        await readUserByEmail('smtp-failure@example.com')
      ).toBeDefined();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('sends a Sprout-hosted Firebase action link', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'verify@example.com',
      password: 'Password123!',
      displayName: 'Verify User',
    });
    const emailText = mockSendEmail.mock.calls[0][0].text;
    expect(res.body.verificationEmailSent).toBe(true);
    expect(emailText).toContain('http://localhost:5173/verify-email');
    expect(emailText).toContain('oobCode=test-code');
    expect(emailText).toContain('apiKey=test-key');
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

  it('rejects duplicate display name with 409', async () => {
    const first = await request(app).post('/api/auth/signup').send({
      email: 'first-display@example.com',
      password: 'Password123!',
      displayName: 'Taken Sprout',
    });
    expect(first.status).toBe(201);

    const res = await request(app).post('/api/auth/signup').send({
      email: 'second-display@example.com',
      password: 'Password123!',
      displayName: '  taken sprout  ',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This display name is already taken.');
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

  it('accepts display names only up to 50 characters using letters, numbers, spaces, underscores, and hyphens', async () => {
    const tooLong = await request(app).post('/api/auth/signup').send({
      email: 'too-long-display@example.com',
      password: 'Password123!',
      displayName: 'A'.repeat(51),
    });
    expect(tooLong.status).toBe(400);

    const invalidCharacter = await request(app).post('/api/auth/signup').send({
      email: 'invalid-display@example.com',
      password: 'Password123!',
      displayName: 'Invalid.Name',
    });
    expect(invalidCharacter.status).toBe(400);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('rejects missing and invalid Firebase ID tokens', async () => {
    const missing = await request(app).post('/api/auth/resend-verification');
    expect(missing.status).toBe(401);

    mockAuthAdmin.verifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const invalid = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', 'Bearer invalid-token');
    expect(invalid.status).toBe(401);
  });

  it('rejects x-dev-uid when AUTH_DEV_BYPASS is enabled', async () => {
    const previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
    process.env.AUTH_DEV_BYPASS = 'true';
    try {
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-dev-uid', 'pending-user');
      expect(res.status).toBe(401);
      expect(mockAuthAdmin.verifyIdToken).not.toHaveBeenCalled();
    } finally {
      if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
      else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
    }
  });

  it('rejects x-dev-uid when DEMO_AUTH_BYPASS is enabled', async () => {
    const previousDemoAuthBypass = process.env.DEMO_AUTH_BYPASS;
    const previousDemoUserId = process.env.DEMO_AUTH_BYPASS_USER_ID;
    process.env.DEMO_AUTH_BYPASS = 'true';
    process.env.DEMO_AUTH_BYPASS_USER_ID = 'demo-user';
    try {
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-dev-uid', 'demo-user');
      expect(res.status).toBe(401);
      expect(mockAuthAdmin.verifyIdToken).not.toHaveBeenCalled();
    } finally {
      if (previousDemoAuthBypass === undefined) delete process.env.DEMO_AUTH_BYPASS;
      else process.env.DEMO_AUTH_BYPASS = previousDemoAuthBypass;
      if (previousDemoUserId === undefined) delete process.env.DEMO_AUTH_BYPASS_USER_ID;
      else process.env.DEMO_AUTH_BYPASS_USER_ID = previousDemoUserId;
    }
  });

  it('resends verification for an authenticated unverified user', async () => {
    const user = await createLocalUser({
      email: 'pending@example.com',
      isVerified: false,
    });
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: false,
    });
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', 'Bearer pending-token');
    expect(res.status).toBe(200);
    expect(res.body.verificationEmailSent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Verify your Sprout account',
      })
    );
  });

  it('returns a no-send response for an already verified Firebase user', async () => {
    const user = await createLocalUser({
      email: 'verified-resend@example.com',
      isVerified: true,
    });
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: true,
    });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', 'Bearer verified-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      verificationEmailSent: false,
      message: 'Email is already verified.',
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when the Firebase user has no email address', async () => {
    const uid = randomUUID();
    mockUsersByUid.set(uid, { uid, emailVerified: false });
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid,
      email_verified: false,
    });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', 'Bearer no-email-token');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Account has no email address.');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns resend-specific recovery when delivery fails', async () => {
    const user = await createLocalUser({
      email: 'retry-delivery@example.com',
      isVerified: false,
    });
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: false,
    });
    mockSendEmail.mockRejectedValueOnce(new Error('delivery failed'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', 'Bearer pending-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        verificationEmailSent: false,
        message: 'The verification email could not be sent. Please try again.',
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it('limits resend attempts to three requests per 15 minutes', async () => {
    const user = await createLocalUser({
      email: 'rate-limited@example.com',
      isVerified: false,
    });
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: false,
    });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', 'Bearer pending-token');
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
  });

  it('does not consume account quota for missing or invalid bearer attempts', async () => {
    const user = await createLocalUser({
      email: 'quota-after-auth@example.com',
      isVerified: false,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const missing = await request(app).post('/api/auth/resend-verification');
      expect(missing.status).toBe(401);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      mockAuthAdmin.verifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
      const invalid = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', `Bearer invalid-${attempt}`);
      expect(invalid.status).toBe(401);
    }

    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: false,
    });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', 'Bearer pending-token')).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('limits one account across changing client IPs', async () => {
    const previousTrustProxy = app.get('trust proxy');
    app.set('trust proxy', 1);
    const user = await createLocalUser({
      email: 'multi-ip-account@example.com',
      isVerified: false,
    });
    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: false,
    });

    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        statuses.push((await request(app)
          .post('/api/auth/resend-verification')
          .set('Authorization', 'Bearer pending-token')
          .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)).status);
      }
      expect(statuses).toEqual([200, 200, 200, 429]);
    } finally {
      app.set('trust proxy', previousTrustProxy);
    }
  });

  it('isolates account quotas for different users on one IP', async () => {
    const first = await createLocalUser({
      email: 'shared-ip-first@example.com',
      isVerified: false,
    });
    const second = await createLocalUser({
      email: 'shared-ip-second@example.com',
      isVerified: false,
    });
    mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
      const user = token === 'first-token' ? first : second;
      return { uid: user.id, email: user.email, email_verified: false };
    });

    const statuses: number[] = [];
    for (const token of ['first-token', 'second-token']) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        statuses.push((await request(app)
          .post('/api/auth/resend-verification')
          .set('Authorization', `Bearer ${token}`)).status);
      }
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it('caps unauthenticated resend abuse at 20 requests per 15 minutes per IP', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      statuses.push((await request(app).post('/api/auth/resend-verification')).status);
    }
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(401));
    expect(statuses[20]).toBe(429);
    expect(mockAuthAdmin.verifyIdToken).not.toHaveBeenCalled();
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
    const row = (await readUserById(user.id))!;
    expect(Boolean(row.isVerified)).toBe(true);
  });

  it('records last login from Firebase Auth metadata when loading the profile', async () => {
    const user = await createLocalUser({
      email: 'metadata-login@example.com',
      isVerified: true,
    });
    mockUsersByUid.set(user.id, {
      uid: user.id,
      email: user.email,
      displayName: 'Test User',
      emailVerified: true,
      password: user.password,
      metadata: {
        lastSignInTime: 'Sat, 11 Jul 2026 10:00:00 GMT',
      },
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
    expect(res.body.lastLogin).toContain('SGT');
    expect(res.body.LastLogin).toBeUndefined();
    expect(res.body.lastLoginAt).toBeUndefined();
    expect(res.body.lastLoginAtReadable).toBeUndefined();

    const row = (await readUserById(user.id))!;
    expect(row.lastLogin).toContain('SGT');
    expect(row.LastLogin).toBeUndefined();
    expect(row.lastLoginAt).toBeUndefined();
    expect(row.lastLoginAtReadable).toBeUndefined();
  });

  // The frontend routes operators to /admin and shows the operator nav links
  // off these flags, so they have to follow the same allowlists the API gates
  // use — not the user document, which has no admin field at all.
  it('reports admin membership from the ADMIN_EMAILS / SUPER_ADMIN_EMAILS allowlists', async () => {
    const previousAdmins = process.env.ADMIN_EMAILS;
    const previousSupers = process.env.SUPER_ADMIN_EMAILS;
    const admin = await createLocalUser({
      email: 'allowlisted@example.com',
      displayName: 'Allowlisted Admin',
    });
    const operator = await createLocalUser({
      email: 'operator@example.com',
      displayName: 'Operator',
    });
    const player = await createLocalUser({
      email: 'player@example.com',
      displayName: 'Player One',
    });

    // Case and padding are the allowlist's problem, not the caller's.
    process.env.ADMIN_EMAILS = ' ALLOWLISTED@example.com , someone@else.com ';
    process.env.SUPER_ADMIN_EMAILS = ' OPERATOR@example.com ';
    try {
      mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: admin.id,
        email: admin.email,
        email_verified: true,
      });
      const adminRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer admin-token');
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.isAdmin).toBe(true);
      expect(adminRes.body.isSuperAdmin).toBe(false);

      // A super admin is an admin everywhere without appearing in both lists.
      mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: operator.id,
        email: operator.email,
        email_verified: true,
      });
      const operatorRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer operator-token');
      expect(operatorRes.status).toBe(200);
      expect(operatorRes.body.isAdmin).toBe(true);
      expect(operatorRes.body.isSuperAdmin).toBe(true);

      mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: player.id,
        email: player.email,
        email_verified: true,
      });
      const playerRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer player-token');
      expect(playerRes.status).toBe(200);
      expect(playerRes.body.isAdmin).toBe(false);
      expect(playerRes.body.isSuperAdmin).toBe(false);

      // Fail closed: unset allowlists make nobody an admin of either tier.
      delete process.env.ADMIN_EMAILS;
      delete process.env.SUPER_ADMIN_EMAILS;
      mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: admin.id,
        email: admin.email,
        email_verified: true,
      });
      const denied = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer admin-token');
      expect(denied.status).toBe(200);
      expect(denied.body.isAdmin).toBe(false);
      expect(denied.body.isSuperAdmin).toBe(false);
    } finally {
      if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previousAdmins;
      if (previousSupers === undefined) delete process.env.SUPER_ADMIN_EMAILS;
      else process.env.SUPER_ADMIN_EMAILS = previousSupers;
    }
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

    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: 'no-email-user',
      email_verified: false,
    });
    const noEmail = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer no-email-token');
    expect(noEmail.status).toBe(403);
    expect(noEmail.body.error).toBe('Email is not verified.');
  });
});

describe('POST /api/auth/session/login and /logout', () => {
  it('records readable last login and logout timestamps on the user profile', async () => {
    const user = await createLocalUser({
      email: 'audit@example.com',
      isVerified: true,
    });

    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: true,
    });

    const login = await request(app)
      .post('/api/auth/session/login')
      .set('Authorization', 'Bearer valid-token');

    expect(login.status).toBe(200);
    expect(login.body.lastLogin).toContain('SGT');
    expect(login.body.LastLogin).toBeUndefined();
    expect(login.body.lastLoginAt).toBeUndefined();
    expect(login.body.lastLoginAtReadable).toBeUndefined();

    const afterLogin = (await readUserById(user.id))!;
    expect(afterLogin.lastLogin).toContain('SGT');
    expect(afterLogin.LastLogin).toBeUndefined();
    expect(afterLogin.lastLoginAt).toBeUndefined();
    expect(afterLogin.lastLoginAtReadable).toBeUndefined();

    const logout = await request(app)
      .post('/api/auth/session/logout')
      .set('Authorization', 'Bearer valid-token');

    expect(logout.status).toBe(200);
    expect(logout.body.lastLogout).toContain('SGT');
    expect(logout.body.LastLogout).toBeUndefined();
    expect(logout.body.lastLogoutAt).toBeUndefined();
    expect(logout.body.lastLogoutAtReadable).toBeUndefined();

    const afterLogout = (await readUserById(user.id))!;
    expect(afterLogout.lastLogout).toContain('SGT');
    expect(afterLogout.LastLogout).toBeUndefined();
    expect(afterLogout.lastLogoutAt).toBeUndefined();
    expect(afterLogout.lastLogoutAtReadable).toBeUndefined();
  });

  it('records login for unverified Firebase users after client sign-in', async () => {
    const user = await createLocalUser({
      email: 'pending-audit@example.com',
      isVerified: false,
    });

    mockAuthAdmin.verifyIdToken.mockResolvedValue({
      uid: user.id,
      email: user.email,
      email_verified: false,
    });

    const login = await request(app)
      .post('/api/auth/session/login')
      .set('Authorization', 'Bearer pending-token');

    expect(login.status).toBe(200);
    expect(login.body.lastLogin).toContain('SGT');

    const afterLogin = (await readUserById(user.id))!;
    expect(afterLogin.lastLogin).toContain('SGT');
  });
});

describe('password reset OTP flow', () => {
  it('returns 200 for known and unknown emails without leaking account existence', async () => {
    await createLocalUser({ email: 'reset@example.com' });

    const known = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'reset@example.com' });
    const unknown = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'unknown@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual({
      message: 'If an account exists, a reset code has been sent.',
    });
    expect(unknown.body).toEqual(known.body);

    const row = (await readUserByEmail('reset@example.com'))!;
    expect(row.resetOtpHash).toBeTruthy();
    expect(row.resetOtpHash).not.toBe(latestOtpFromEmailPayload());
  });

  it('performs one bcrypt hash for both known and unknown valid-email requests', async () => {
    await createLocalUser({ email: 'work-parity@example.com' });
    const hashSpy = jest.spyOn(bcrypt, 'hash');

    const beforeKnown = hashSpy.mock.calls.length;
    const known = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'work-parity@example.com' });
    const knownHashCalls = hashSpy.mock.calls.length - beforeKnown;

    const beforeUnknown = hashSpy.mock.calls.length;
    const unknown = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'never-stored@example.com' });
    const unknownHashCalls = hashSpy.mock.calls.length - beforeUnknown;

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(knownHashCalls).toBe(1);
    expect(unknownHashCalls).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(await readUserByEmail('never-stored@example.com')).toBeUndefined();
  });

  it('keeps the generic 200 response and controlled logs when reset delivery rejects', async () => {
    const secret = 'smtp-token=provider-secret-value';
    await createLocalUser({ email: 'provider-failure@example.com' });
    mockSendEmail.mockRejectedValueOnce(new Error(secret));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const known = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: 'provider-failure@example.com' });
      const unknown = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: 'provider-failure-unknown@example.com' });
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
      const logs = errSpy.mock.calls.flat().join('\n');
      expect(logs).toContain('password_reset_email_delivery_failed');
      expect(logs).not.toContain(secret);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('keeps the generic 200 response when known-account OTP persistence rejects', async () => {
    const secret = 'database-password=reset-state-secret';
    await createLocalUser({ email: 'state-failure@example.com' });
    const persistenceSpy = jest
      .spyOn(authUserRepository, 'setResetOtp')
      .mockRejectedValueOnce(new Error(secret));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const known = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: 'state-failure@example.com' });
      const unknown = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: 'state-failure-unknown@example.com' });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
      expect(mockSendEmail).not.toHaveBeenCalled();
      const logs = errSpy.mock.calls.flat().join('\n');
      expect(logs).toContain('password_reset_state_write_failed');
      expect(logs).not.toContain(secret);
    } finally {
      persistenceSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('returns before the reset email provider settles', async () => {
    await createLocalUser({ email: 'slow-provider@example.com' });
    const providerStarted = deferred();
    let rejectProvider!: (reason: unknown) => void;
    mockSendEmail.mockImplementationOnce(() => {
      providerStarted.resolve();
      return new Promise((_, reject) => {
        rejectProvider = reject;
      });
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const responsePromise = request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'slow-provider@example.com' })
      .then((response) => response);

    try {
      await providerStarted.promise;
      const response = await Promise.race([
        responsePromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
      ]);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(200);
    } finally {
      rejectProvider(new Error('smtp-token=slow-provider-secret'));
      await responsePromise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      errSpy.mockRestore();
    }
  });

  it('resets a password with a valid OTP and clears the stored OTP', async () => {
    const user = await createLocalUser({ email: 'success@example.com' });

    await request(app)
      .post('/api/auth/request-reset')
      .send({ email: user.email });
    const otp = latestOtpFromEmailPayload();
    await updateUser(user.id, { resetOtpFailedAttempts: 4 });

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

    const row = (await readUserById(user.id))!;
    expect(row.resetOtpHash).toBeNull();
    expect(row.resetOtpFailedAttempts).toBe(0);
    expect(await bcrypt.compare('Password123!!', row.passwordHash)).toBe(true);
    const history = await readPasswordHistory(user.id);
    expect(history).toHaveLength(1);
    expect(await bcrypt.compare(user.password, history[0].passwordHash)).toBe(true);
  });

  it('allows only one parallel request to consume a valid OTP', async () => {
    const user = await createLocalUser({ email: 'parallel-valid@example.com' });
    await deletePasswordHistory(user.id);
    await request(app).post('/api/auth/request-reset').send({ email: user.email });
    const otp = latestOtpFromEmailPayload();
    const payload = {
      email: user.email,
      otp,
      newPassword: 'Password123!!',
    };

    const responses = await Promise.all([
      request(app).post('/api/auth/verify-reset').send(payload),
      request(app).post('/api/auth/verify-reset').send(payload),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 400]);
    expect(responses.find((res) => res.status === 400)?.body.error).toBe(
      'Invalid OTP. Request a new one.'
    );
    expect(mockAuthAdmin.updateUser).toHaveBeenCalledTimes(1);
    const history = await readPasswordHistory(user.id);
    expect(history).toHaveLength(1);
    expect(await bcrypt.compare(user.password, history[0].passwordHash)).toBe(true);
  });

  it('does not let a stale invalid request increment a freshly resent OTP', async () => {
    const user = await createLocalUser({ email: 'stale-invalid@example.com' });
    const oldOtpHash = await bcrypt.hash('123456', Number(process.env.BCRYPT_COST));
    await updateUser(user.id, {
      resetOtpHash: oldOtpHash,
      resetOtpExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      resetOtpFailedAttempts: 4,
    });

    const profileRead = deferred();
    const releaseProfile = deferred();
    const originalGetByEmail = authUserRepository.getByEmail.bind(authUserRepository);
    const getByEmailSpy = jest
      .spyOn(authUserRepository, 'getByEmail')
      .mockImplementationOnce(async (email) => {
        const profile = await originalGetByEmail(email);
        profileRead.resolve();
        await releaseProfile.promise;
        return profile;
      });

    try {
      const staleResponsePromise = request(app)
        .post('/api/auth/verify-reset')
        .send({
          email: user.email,
          otp: '000000',
          newPassword: 'Password123!!',
        })
        .then((res) => res);
      await profileRead.promise;

      const resend = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: user.email });
      expect(resend.status).toBe(200);
      const freshRow = (await readUserById(user.id))!;
      expect(freshRow.resetOtpHash).not.toBe(oldOtpHash);

      releaseProfile.resolve();
      const staleResponse = await staleResponsePromise;
      expect(staleResponse.status).toBe(400);

      const finalRow = (await readUserById(user.id))!;
      expect(finalRow.resetOtpHash).toBe(freshRow.resetOtpHash);
      expect(finalRow.resetOtpFailedAttempts).toBe(0);
    } finally {
      releaseProfile.resolve();
      getByEmailSpy.mockRestore();
    }
  });

  it('does not let a stale expired request clear a freshly resent OTP', async () => {
    const user = await createLocalUser({ email: 'stale-expired@example.com' });
    const oldOtpHash = await bcrypt.hash('123456', Number(process.env.BCRYPT_COST));
    await updateUser(user.id, {
      resetOtpHash: oldOtpHash,
      resetOtpExpiresAt: new Date(Date.now() - 1000).toISOString(),
      resetOtpFailedAttempts: 4,
    });

    const profileRead = deferred();
    const releaseProfile = deferred();
    const originalGetByEmail = authUserRepository.getByEmail.bind(authUserRepository);
    const getByEmailSpy = jest
      .spyOn(authUserRepository, 'getByEmail')
      .mockImplementationOnce(async (email) => {
        const profile = await originalGetByEmail(email);
        profileRead.resolve();
        await releaseProfile.promise;
        return profile;
      });

    try {
      const staleResponsePromise = request(app)
        .post('/api/auth/verify-reset')
        .send({
          email: user.email,
          otp: '123456',
          newPassword: 'Password123!!',
        })
        .then((res) => res);
      await profileRead.promise;

      const resend = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: user.email });
      expect(resend.status).toBe(200);
      const freshRow = (await readUserById(user.id))!;
      expect(freshRow.resetOtpHash).not.toBe(oldOtpHash);

      releaseProfile.resolve();
      const staleResponse = await staleResponsePromise;
      expect(staleResponse.status).toBe(400);
      expect(staleResponse.body.error).toBe('OTP has expired. Request a new one.');

      const finalRow = (await readUserById(user.id))!;
      expect(finalRow.resetOtpHash).toBe(freshRow.resetOtpHash);
      expect(finalRow.resetOtpFailedAttempts).toBe(0);
    } finally {
      releaseProfile.resolve();
      getByEmailSpy.mockRestore();
    }
  });

  it('keeps a claimed OTP consumed when the Firebase password update fails', async () => {
    const user = await createLocalUser({ email: 'firebase-failure@example.com' });
    await request(app).post('/api/auth/request-reset').send({ email: user.email });
    const otp = latestOtpFromEmailPayload();
    mockAuthAdmin.updateUser.mockRejectedValueOnce(new Error('firebase unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = await request(app).post('/api/auth/verify-reset').send({
        email: user.email,
        otp,
        newPassword: 'Password123!!',
      });
      expect(failed.status).toBe(500);
      expect(failed.body.error).toBe('Internal server error.');

      const row = (await readUserById(user.id))!;
      expect(row.resetOtpHash).toBeNull();
      expect(row.resetOtpExpiresAt).toBeNull();
      expect(row.resetOtpFailedAttempts).toBe(0);

      const retry = await request(app).post('/api/auth/verify-reset').send({
        email: user.email,
        otp,
        newPassword: 'Password123!!',
      });
      expect(retry.status).toBe(400);
      expect(mockAuthAdmin.updateUser).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rejects invalid OTP, expired OTP, weak password, and recent reuse', async () => {
    const user = await createLocalUser({ email: 'reject@example.com' });
    const otpHash = await bcrypt.hash('123456', Number(process.env.BCRYPT_COST));
    await updateUser(user.id, {
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

    await updateUser(user.id, {
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

  it('invalidates an OTP after five wrong attempts', async () => {
    const user = await createLocalUser({ email: 'attempts@example.com' });
    const otpHash = await bcrypt.hash('123456', Number(process.env.BCRYPT_COST));
    await updateUser(user.id, {
      resetOtpHash: otpHash,
      resetOtpExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      resetOtpFailedAttempts: 0,
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await request(app).post('/api/auth/verify-reset').send({
        email: user.email,
        otp: '000000',
        newPassword: 'Password123!!',
      });
      expect(res.status).toBe(400);
      if (attempt === 5) {
        expect(res.body.error).toBe('Invalid OTP. Request a new one.');
      }
    }

    const row = (await readUserById(user.id))!;
    expect(row.resetOtpHash).toBeNull();
    expect(row.resetOtpFailedAttempts).toBe(0);
  });

  it('atomically invalidates one issuance under five concurrent wrong OTPs', async () => {
    const user = await createLocalUser({ email: 'concurrent-attempts@example.com' });
    const otpHash = await bcrypt.hash('123456', Number(process.env.BCRYPT_COST));
    await updateUser(user.id, {
      resetOtpHash: otpHash,
      resetOtpExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      resetOtpFailedAttempts: 0,
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post('/api/auth/verify-reset').send({
          email: user.email,
          otp: '000000',
          newPassword: 'Password123!!',
        })
      )
    );

    expect(responses.map((response) => response.status)).toEqual(Array(5).fill(400));
    expect(responses.map((response) => response.body.error).sort()).toEqual([
      'Invalid OTP.',
      'Invalid OTP.',
      'Invalid OTP.',
      'Invalid OTP.',
      'Invalid OTP. Request a new one.',
    ]);
    const row = (await readUserById(user.id))!;
    expect(row.resetOtpHash).toBeNull();
    expect(row.resetOtpExpiresAt).toBeNull();
    expect(row.resetOtpFailedAttempts).toBe(0);
  });
});

/**
 * Google taking over an address that already has a password account.
 *
 * Firebase runs one account per email and treats Google as a trusted provider,
 * so signing in with Google on an *unverified* password account keeps the uid
 * and swaps the credential: the password is unlinked, and the password the user
 * chose at signup stops working. Nothing about the Firestore profile changes,
 * which is why the login screen used to answer "Invalid email or password" and
 * leave them with no way forward.
 */
describe('auth provider takeover', () => {
  function linkGoogle(uid: string): void {
    const user = mockUsersByUid.get(uid)!;
    const updated: MockFirebaseUser = {
      ...user,
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
    };
    mockUsersByUid.set(uid, updated);
    if (updated.email) mockUsersByEmail.set(updated.email, updated);
  }

  it('tags a password signup as a password account', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'tagged@example.com',
      password: 'Password123!',
      displayName: 'Tagged User',
    });

    expect(res.status).toBe(201);
    const row = (await readUserByEmail('tagged@example.com'))!;
    expect(row.authProvider).toBe('password');
  });

  it('retags the profile to google after a takeover, without deleting it', async () => {
    const user = await createLocalUser({
      email: 'taken-over@example.com',
      isVerified: false,
    });
    // Progression hanging off this uid is exactly what deleting the document
    // would destroy, so assert it survives.
    await updateUser(user.id, { pveXp: 250, pveWins: 7 });
    linkGoogle(user.id);
    mockAuthAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: user.id,
      email: user.email,
      email_verified: true,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer google-token');

    expect(res.status).toBe(200);
    expect(res.body.authProvider).toBe('google');
    const row = (await readUserById(user.id))!;
    expect(row.authProvider).toBe('google');
    expect(row.pveXp).toBe(250);
    expect(row.pveWins).toBe(7);
  });

  it('tells the login screen that a taken-over address now uses Google', async () => {
    const user = await createLocalUser({
      email: 'now-google@example.com',
      isVerified: false,
    });
    linkGoogle(user.id);

    const res = await request(app)
      .post('/api/auth/sign-in-method')
      .send({ email: 'now-google@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe('google');
  });

  /* Password accounts and addresses with no account must be indistinguishable,
     or the endpoint becomes an account-enumeration oracle. */
  it('answers unknown for a password account and for no account at all', async () => {
    await createLocalUser({ email: 'still-password@example.com' });

    const password = await request(app)
      .post('/api/auth/sign-in-method')
      .send({ email: 'still-password@example.com' });
    const absent = await request(app)
      .post('/api/auth/sign-in-method')
      .send({ email: 'nobody@example.com' });

    expect(password.status).toBe(absent.status);
    expect(password.body).toEqual(absent.body);
    expect(password.body.method).toBe('unknown');
  });

  it('points a manual signup at Google when the address is already Google-linked', async () => {
    const user = await createLocalUser({
      email: 'google-owned@example.com',
      isVerified: false,
    });
    linkGoogle(user.id);

    const res = await request(app).post('/api/auth/signup').send({
      email: 'google-owned@example.com',
      password: 'Password123!',
      displayName: 'Someone Else',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/continue with google/i);
  });
});
