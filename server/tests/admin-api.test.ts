import request from 'supertest';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

const mockAuthAdmin = {
  verifyIdToken: jest.fn(),
  deleteUser: jest.fn(),
};

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';

const ADMIN_EMAIL = 'hello.sprout.team@gmail.com';
const ADMIN_UID = 'admin-uid';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member-uid@example.com';

let previousAdminEmails: string | undefined;
let previousAuthDevBypass: string | undefined;

/** Tokens encode the caller so each test states its own identity:
 *  `verified:<uid>:<email>`. */
function authorization(uid: string, email: string): string {
  return `Bearer verified:${uid}:${email}`;
}

const asAdmin = () => authorization(ADMIN_UID, ADMIN_EMAIL);
const asMember = () => authorization(MEMBER_UID, MEMBER_EMAIL);

async function seedProfile(
  uid: string,
  email: string,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await getDb()
    .collection('users')
    .doc(uid)
    .set({
      email,
      displayName: email.split('@')[0],
      isVerified: true,
      pveXp: 0,
      pveWins: 0,
      pveLosses: 0,
      currentPveWinStreak: 0,
      bestPveWinStreak: 0,
      passwordHash: '',
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      ...overrides,
    });
}

beforeEach(async () => {
  previousAdminEmails = process.env.ADMIN_EMAILS;
  previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.AUTH_DEV_BYPASS = 'false';

  mockAuthAdmin.verifyIdToken.mockReset();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    const [kind, uid, email] = token.split(':');
    if (kind !== 'verified' || !uid) throw new Error('invalid test token');
    return { uid, email: email ?? `${uid}@example.com`, email_verified: true };
  });
  mockAuthAdmin.deleteUser.mockReset().mockResolvedValue(undefined);

  await clearFirestore();
});

afterEach(() => {
  if (previousAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previousAdminEmails;
  if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
  else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
});

describe('GET /api/admin/users authorisation', () => {
  it('rejects an anonymous caller', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects a signed-in user who is not on the allowlist', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asMember());

    expect(res.status).toBe(403);
    // The response must not hint at who the admins are.
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_EMAIL);
  });

  it('denies everyone when the allowlist is unset (fail closed)', async () => {
    delete process.env.ADMIN_EMAILS;
    await seedProfile(ADMIN_UID, ADMIN_EMAIL);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(403);
  });

  it('denies everyone when the allowlist is empty or comma-only', async () => {
    process.env.ADMIN_EMAILS = ' , ,';

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(403);
  });

  it('matches allowlist entries case-insensitively and ignores padding', async () => {
    process.env.ADMIN_EMAILS = `  ${ADMIN_EMAIL.toUpperCase()} , someone@else.com `;
    await seedProfile(ADMIN_UID, ADMIN_EMAIL);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
  });

  it('cannot be reached with the dev bypass header instead of a token', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';

    const res = await request(app).get('/api/admin/users').set('x-dev-uid', ADMIN_UID);

    // The bypass yields a uid with no email, so the allowlist can never match.
    expect([401, 403]).toContain(res.status);
  });
});

describe('GET /api/admin/users listing', () => {
  it('returns every account with newest first and flags admins', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL, {
      createdAt: '2026-07-21T00:00:00.000Z',
      pveWins: 3,
    });
    await seedProfile(ADMIN_UID, ADMIN_EMAIL, {
      createdAt: '2026-07-19T00:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      MEMBER_UID,
      ADMIN_UID,
    ]);
    const admin = res.body.items.find((item: { id: string }) => item.id === ADMIN_UID);
    const member = res.body.items.find((item: { id: string }) => item.id === MEMBER_UID);
    expect(admin.isAdmin).toBe(true);
    expect(member.isAdmin).toBe(false);
    expect(member.pveWins).toBe(3);
  });

  it('never exposes password or OTP secrets', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL, {
      passwordHash: 'super-secret-hash',
      resetOtpHash: 'super-secret-otp',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asAdmin());

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('super-secret-hash');
    expect(body).not.toContain('super-secret-otp');
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('resetOtpHash');
  });

  it('returns an empty list rather than failing when there are no accounts', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });
});

describe('DELETE /api/admin/users/:uid', () => {
  it('removes the Firebase identity and the Sprout profile', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .delete(`/api/admin/users/${MEMBER_UID}`)
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: MEMBER_UID,
      firebaseIdentityDeleted: true,
      profileDeleted: true,
    });
    expect(mockAuthAdmin.deleteUser).toHaveBeenCalledWith(MEMBER_UID);
    const doc = await getDb().collection('users').doc(MEMBER_UID).get();
    expect(doc.exists).toBe(false);
  });

  it('frees the email so the same address can register again', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    await request(app)
      .delete(`/api/admin/users/${MEMBER_UID}`)
      .set('Authorization', asAdmin());

    const snap = await getDb()
      .collection('users')
      .where('email', '==', MEMBER_EMAIL)
      .get();
    expect(snap.empty).toBe(true);
  });

  it('refuses to let an admin delete their own account', async () => {
    await seedProfile(ADMIN_UID, ADMIN_EMAIL);

    const res = await request(app)
      .delete(`/api/admin/users/${ADMIN_UID}`)
      .set('Authorization', asAdmin());

    expect(res.status).toBe(400);
    expect(mockAuthAdmin.deleteUser).not.toHaveBeenCalled();
    const doc = await getDb().collection('users').doc(ADMIN_UID).get();
    expect(doc.exists).toBe(true);
  });

  it('rejects a non-admin caller and leaves the account intact', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);
    await seedProfile('victim-uid', 'victim@example.com');

    const res = await request(app)
      .delete('/api/admin/users/victim-uid')
      .set('Authorization', asMember());

    expect(res.status).toBe(403);
    expect(mockAuthAdmin.deleteUser).not.toHaveBeenCalled();
    const doc = await getDb().collection('users').doc('victim-uid').get();
    expect(doc.exists).toBe(true);
  });

  it('still clears an orphaned profile when the identity is already gone', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);
    mockAuthAdmin.deleteUser.mockRejectedValue(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
    );

    const res = await request(app)
      .delete(`/api/admin/users/${MEMBER_UID}`)
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.firebaseIdentityDeleted).toBe(false);
    expect(res.body.profileDeleted).toBe(true);
    const doc = await getDb().collection('users').doc(MEMBER_UID).get();
    expect(doc.exists).toBe(false);
  });

  it('reports 404 when neither an identity nor a profile exists', async () => {
    mockAuthAdmin.deleteUser.mockRejectedValue(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
    );

    const res = await request(app)
      .delete('/api/admin/users/ghost-uid')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(404);
  });

  it('keeps the profile when Firebase deletion fails for an unknown reason', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);
    mockAuthAdmin.deleteUser.mockRejectedValue(new Error('network down'));

    const res = await request(app)
      .delete(`/api/admin/users/${MEMBER_UID}`)
      .set('Authorization', asAdmin());

    expect(res.status).toBe(502);
    // The profile must survive so the operator can retry rather than being
    // left with a login that has no profile.
    const doc = await getDb().collection('users').doc(MEMBER_UID).get();
    expect(doc.exists).toBe(true);
  });
});
