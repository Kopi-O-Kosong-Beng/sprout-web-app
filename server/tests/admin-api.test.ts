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

/**
 * The superadmin grant has two independent sources: the Firestore
 * `isSuperAdmin` flag (the normal path) and the ADMIN_EMAILS allowlist
 * (break-glass). Either alone is sufficient, and both fail closed.
 *
 * The allowlist half is covered by the authorisation block above, which runs
 * with ADMIN_EMAILS set. These clear it, so only the flag can be granting.
 */
describe('superadmin grant via the Firestore flag', () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it('admits a caller carrying the flag with no allowlist configured', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL, { isSuperAdmin: true });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
  });

  it('denies a caller whose flag is absent', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asMember());

    expect(res.status).toBe(403);
  });

  it('denies a caller whose flag is explicitly false', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL, { isSuperAdmin: false });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', asMember());

    expect(res.status).toBe(403);
  });

  /* Fail closed on anything that is not the boolean true. A string "true"
   * written by hand in the Firebase console must not buy account deletion. */
  it.each([['true'], [1], ['yes'], [{}]])(
    'denies a caller whose flag is %p rather than boolean true',
    async (value) => {
      await seedProfile(MEMBER_UID, MEMBER_EMAIL, { isSuperAdmin: value });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', asMember());

      expect(res.status).toBe(403);
    }
  );

  it('has no profile to read for an unknown uid, so denies', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', authorization('ghost-uid', 'ghost@example.com'));

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/users/:uid/superadmin', () => {
  it('grants the flag to another account', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .patch(`/api/admin/users/${MEMBER_UID}/superadmin`)
      .set('Authorization', asAdmin())
      .send({ isSuperAdmin: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: MEMBER_UID, isSuperAdmin: true });

    const stored = await getDb().collection('users').doc(MEMBER_UID).get();
    expect(stored.data()?.isSuperAdmin).toBe(true);
  });

  it('revokes the flag again', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL, { isSuperAdmin: true });

    const res = await request(app)
      .patch(`/api/admin/users/${MEMBER_UID}/superadmin`)
      .set('Authorization', asAdmin())
      .send({ isSuperAdmin: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSuperAdmin: false });

    const stored = await getDb().collection('users').doc(MEMBER_UID).get();
    expect(stored.data()?.isSuperAdmin).toBe(false);
  });

  /* The operator holding the console must not be able to lock themselves out
   * of it with one click, for the same reason they cannot delete their own
   * account. */
  it('refuses to change your own row', async () => {
    await seedProfile(ADMIN_UID, ADMIN_EMAIL, { isSuperAdmin: true });

    const res = await request(app)
      .patch(`/api/admin/users/${ADMIN_UID}/superadmin`)
      .set('Authorization', asAdmin())
      .send({ isSuperAdmin: false });

    expect(res.status).toBe(400);
    const stored = await getDb().collection('users').doc(ADMIN_UID).get();
    expect(stored.data()?.isSuperAdmin).toBe(true);
  });

  /* Clearing the flag on an allowlisted address would report success while
   * ADMIN_EMAILS kept granting. Refusing is the honest answer. */
  it('refuses to revoke an account the allowlist is granting', async () => {
    const otherAdmin = 'second-admin@example.com';
    process.env.ADMIN_EMAILS = `${ADMIN_EMAIL},${otherAdmin}`;
    await seedProfile('second-admin-uid', otherAdmin, { isSuperAdmin: true });

    const res = await request(app)
      .patch('/api/admin/users/second-admin-uid/superadmin')
      .set('Authorization', asAdmin())
      .send({ isSuperAdmin: false });

    expect(res.status).toBe(409);
    const stored = await getDb().collection('users').doc('second-admin-uid').get();
    expect(stored.data()?.isSuperAdmin).toBe(true);
  });

  it('rejects a non-boolean payload', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .patch(`/api/admin/users/${MEMBER_UID}/superadmin`)
      .set('Authorization', asAdmin())
      .send({ isSuperAdmin: 'true' });

    expect(res.status).toBe(400);
  });

  it('answers 404 for an account that does not exist', async () => {
    const res = await request(app)
      .patch('/api/admin/users/ghost-uid/superadmin')
      .set('Authorization', asAdmin())
      .send({ isSuperAdmin: true });

    expect(res.status).toBe(404);
  });

  it('is closed to a caller without the grant', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .patch(`/api/admin/users/${MEMBER_UID}/superadmin`)
      .set('Authorization', asMember())
      .send({ isSuperAdmin: true });

    expect(res.status).toBe(403);
  });
});

/**
 * Ticket Manager — the operator side of the Contact form.
 *
 * Unlike the public status check this returns whole tickets, message body and
 * reporter included: answering a ticket means reading it, and the route sits
 * behind requireSuperAdmin.
 */
describe('Ticket Manager endpoints', () => {
  async function seedTicket(
    id: string,
    overrides: Record<string, unknown> = {}
  ): Promise<void> {
    await getDb()
      .collection('query_tickets')
      .doc(id)
      .set({
        id,
        refNumber: `SPR-20260721-${id.slice(-4)}`,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        organisation: '',
        subject: 'Scan failed on a fern',
        category: 'general',
        message: 'The camera returned nothing.',
        status: 'open',
        submitterEmailStatus: 'sent',
        adminEmailStatus: 'sent',
        lastEmailError: null,
        notificationUpdatedAt: null,
        resolvedAt: null,
        createdAt: '2026-07-21T02:00:00.000Z',
        updatedAt: '2026-07-21T02:00:00.000Z',
        ...overrides,
      });
  }

  it('is closed to a caller without the grant', async () => {
    await seedProfile(MEMBER_UID, MEMBER_EMAIL);

    const res = await request(app)
      .get('/api/admin/tickets')
      .set('Authorization', asMember());

    expect(res.status).toBe(403);
  });

  it('lists tickets newest first', async () => {
    await seedTicket('ticket-0001', { createdAt: '2026-07-21T02:00:00.000Z' });
    await seedTicket('ticket-0002', { createdAt: '2026-07-23T02:00:00.000Z' });

    const res = await request(app)
      .get('/api/admin/tickets')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((t: { id: string }) => t.id)).toEqual([
      'ticket-0002',
      'ticket-0001',
    ]);
  });

  /* Regression: tickets written before the notification fields existed used to
   * make the whole listing throw, taking every healthy ticket down with them.
   * A queue that 500s because of one old row is worse than one that shows it. */
  it('lists tickets that predate the notification fields', async () => {
    await seedTicket('ticket-0003', {
      submitterEmailStatus: undefined,
      adminEmailStatus: undefined,
      subject: undefined,
    });
    await seedTicket('ticket-0004');

    const res = await request(app)
      .get('/api/admin/tickets')
      .set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('resolves a ticket and stamps the reply time', async () => {
    await seedTicket('ticket-0005');

    const res = await request(app)
      .patch('/api/admin/tickets/ticket-0005/status')
      .set('Authorization', asAdmin())
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(Number.isNaN(Date.parse(res.body.resolvedAt))).toBe(false);
  });

  it('clears the reply time when reopened', async () => {
    await seedTicket('ticket-0006', {
      status: 'resolved',
      resolvedAt: '2026-07-23T09:30:00.000Z',
    });

    const res = await request(app)
      .patch('/api/admin/tickets/ticket-0006/status')
      .set('Authorization', asAdmin())
      .send({ status: 'open' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'open', resolvedAt: null });
  });

  it('rejects an unknown status', async () => {
    await seedTicket('ticket-0007');

    const res = await request(app)
      .patch('/api/admin/tickets/ticket-0007/status')
      .set('Authorization', asAdmin())
      .send({ status: 'closed' });

    expect(res.status).toBe(400);
  });

  it('answers 404 for a ticket that does not exist', async () => {
    const res = await request(app)
      .patch('/api/admin/tickets/ghost-ticket/status')
      .set('Authorization', asAdmin())
      .send({ status: 'resolved' });

    expect(res.status).toBe(404);
  });
});
