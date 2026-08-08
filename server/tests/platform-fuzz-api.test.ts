/**
 * POST /api/platform/run-fuzz, asserted at the wire.
 *
 * pipeline/__tests__/fuzzRunner.test.ts covers what the runner DECIDES —
 * clamping, suite validation, single-flight. This covers something a unit test
 * structurally cannot: that the endpoint exists, that it is actually behind
 * the superadmin gate, and that a hand-edited body is coerced before it
 * reaches the runner rather than after.
 *
 * That gate matters more here than on a read endpoint. This route spawns
 * CPU-bound sharp decoding in-process on a 512MB instance, so an unauthorised
 * caller able to reach it could ask for work the box cannot survive — which is
 * exactly the failure the extreme_resize rewrite was about.
 *
 * No emulator needed, but that takes two mocks rather than one. A GRANTED
 * request short-circuits on SUPER_ADMIN_EMAILS before any profile lookup; a
 * DENIED one does not — resolveSuperAdmin falls through to the Firestore
 * `isSuperAdmin` flag, which without an emulator hangs until the test times
 * out. So the profile read is stubbed to "no profile", which is the state a
 * non-operator is actually in.
 */
import request from 'supertest';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

/* Only getById is replaced; everything else stays real, so this cannot quietly
   neuter another part of the app's import graph. */
jest.mock('../repositories/auth-users', () => {
  const actual = jest.requireActual('../repositories/auth-users');
  return {
    ...actual,
    default: { ...actual.default, getById: jest.fn(async () => null) },
  };
});

import app from '../app';

const SUPERADMIN_EMAIL = 'operator@example.com';
const MEMBER_EMAIL = 'player@example.com';

/** `verified:<uid>:<email>`, so each request states its own identity. */
function authorization(uid: string, email: string): string {
  return `Bearer verified:${uid}:${email}`;
}

const asSuperAdmin = () => authorization('operator-uid', SUPERADMIN_EMAIL);
const asMember = () => authorization('member-uid', MEMBER_EMAIL);

let previousSuperAdminEmails: string | undefined;

beforeAll(() => {
  previousSuperAdminEmails = process.env.SUPER_ADMIN_EMAILS;
  process.env.SUPER_ADMIN_EMAILS = SUPERADMIN_EMAIL;
});

afterAll(() => {
  if (previousSuperAdminEmails === undefined) delete process.env.SUPER_ADMIN_EMAILS;
  else process.env.SUPER_ADMIN_EMAILS = previousSuperAdminEmails;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    if (!token.startsWith('verified:')) throw new Error('bad token');
    const [uid, email] = token.slice('verified:'.length).split(':');
    return { uid, email, email_verified: true };
  });
});

describe('POST /api/platform/run-fuzz — the gate in front of it', () => {
  it('refuses an unauthenticated caller', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .send({ suite: 'text' });

    expect(response.status).toBe(401);
  });

  /* A verified account is not an operator. The pipeline router makes exactly
     this distinction — auth but NOT superadmin — which is why the sprite leg
     needed guarding, so it is worth asserting that the platform router does
     not repeat the mistake in the other direction. */
  it('refuses a verified caller who is not a superadmin', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asMember())
      .send({ suite: 'text' });

    expect(response.status).toBe(403);
    // Never confirms whether an allowlist exists or who is on it.
    expect(response.body.error).toBe('Admin access required.');
  });
});

describe('POST /api/platform/run-fuzz — request handling', () => {
  it('runs the text suite for a superadmin and returns its report', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asSuperAdmin())
      .send({ suite: 'text' });

    expect(response.status).toBe(200);
    expect(response.body.suite).toBe('text');
    expect(response.body.ok).toBe(true);
    expect(response.body.text.totalCases).toBeGreaterThan(80);
    expect(response.body.text.findings).toEqual([]);
  }, 30_000);

  /* The body is JSON from a browser field, so `runs` arrives as whatever the
     operator typed. Clamping has to happen at the boundary: a value that
     reaches the runner unbounded is a request the instance cannot survive. */
  it('clamps a below-floor run count rather than honouring it', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asSuperAdmin())
      .send({ suite: 'baseline', runs: 1, rngSeed: 1 });

    expect(response.status).toBe(200);
    expect(response.body.baseline.runs).toBe(10);
    expect(response.body.baseline.survivors).toBe(0);
  }, 30_000);

  it('coerces a numeric string run count', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asSuperAdmin())
      .send({ suite: 'mutation', runs: '10', rngSeed: 42 });

    expect(response.status).toBe(200);
    expect(response.body.mutation.runs).toBe(10);
  }, 60_000);

  /* An unrecognised suite must not fall through to whichever branch happens to
     be last. It falls back to the documented default, explicitly. */
  it('falls back to the mutation suite when the suite is unrecognised', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asSuperAdmin())
      .send({ suite: 'definitely-not-a-suite', runs: 10, rngSeed: 42 });

    expect(response.status).toBe(200);
    expect(response.body.suite).toBe('mutation');
  }, 60_000);

  it('rejects a non-numeric rngSeed instead of replaying NaN', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asSuperAdmin())
      .send({ suite: 'text', rngSeed: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('rngSeed must be a number.');
  });

  /* Seed 0 is a legitimate seed, and `rngSeed: 0` must mean "replay seed 0"
     rather than "explore", which is the bug a falsy check would introduce. */
  it('treats seed 0 as a replay rather than as absent', async () => {
    const response = await request(app)
      .post('/api/platform/run-fuzz')
      .set('Authorization', asSuperAdmin())
      .send({ suite: 'mutation', runs: 10, rngSeed: 0 });

    expect(response.status).toBe(200);
    expect(response.body.mutation.rngSeed).toBe(0);
    expect(response.body.mutation.deterministic).toBe(true);
  }, 60_000);
});

/*
 * The 409 in-flight guard is asserted in pipeline/__tests__/fuzzRunner.test.ts
 * instead, at the module level, where `isFuzzRunInFlight()` can be observed
 * deterministically. Racing two HTTP requests to reach it would depend on the
 * first arriving before the second, which is a flaky test dressed up as
 * coverage.
 */
