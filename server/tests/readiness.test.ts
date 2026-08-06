/**
 * Readiness probing, and the liveness/readiness split it exists to express.
 *
 * The unit cases drive `evaluateReadiness` with fake probes so every branch —
 * failure, timeout, partial failure — is reachable without breaking a real
 * dependency. The last block is a genuine integration case: it hits the mounted
 * routes on the real app against the Firestore emulator the suite already runs.
 */
import express from 'express';
import request from 'supertest';
import app from '../app';
import { createReadinessHandler } from '../routes/health.routes';
import {
  evaluateReadiness,
  firestoreProbe,
  hasFirebaseCredentialSource,
  type Probe,
} from '../services/readiness.service';

const ok = (name: string): Probe => ({ name, check: async () => undefined });
const failing = (name: string): Probe => ({
  name,
  check: async () => {
    throw new Error('dependency refused the connection');
  },
});
const hanging = (name: string): Probe => ({
  name,
  check: () => new Promise(() => {}),
});

/** Mounts one handler on a bare app so a route can be driven without the
 *  real probe list. */
function appWith(probes: Probe[], timeoutMs?: number) {
  const harness = express();
  harness.get('/api/health/ready', createReadinessHandler(probes, timeoutMs));
  return harness;
}

describe('evaluateReadiness', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // The service logs probe failures on purpose; silence them so a passing
    // suite does not look like a failing one.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  it('reports ready only when every probe answers', async () => {
    const report = await evaluateReadiness([ok('firestore'), ok('storage')]);

    expect(report.status).toBe('ready');
    expect(report.checks.map((c) => c.status)).toEqual(['ok', 'ok']);
    expect(Date.parse(report.timestamp)).not.toBeNaN();
  });

  it('reports every probe, not just the first failure', async () => {
    const report = await evaluateReadiness([
      failing('firestore'),
      ok('storage'),
      failing('email'),
    ]);

    // "Firestore is down" and "Firestore and email are both down" are
    // different operational situations; the report must distinguish them.
    expect(report.status).toBe('not_ready');
    expect(report.checks).toEqual([
      expect.objectContaining({ name: 'firestore', status: 'failed' }),
      expect.objectContaining({ name: 'storage', status: 'ok' }),
      expect.objectContaining({ name: 'email', status: 'failed' }),
    ]);
  });

  it('times a hung dependency out instead of hanging with it', async () => {
    const started = Date.now();
    const report = await evaluateReadiness([hanging('firestore')], 40);

    expect(report.status).toBe('not_ready');
    expect(report.checks[0]).toEqual(
      expect.objectContaining({ name: 'firestore', status: 'timed_out' })
    );
    // The probe never settles, so finishing at all is the assertion: without
    // the race this await would never return.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('runs probes concurrently so the worst case is the slowest, not the sum', async () => {
    const started = Date.now();
    const report = await evaluateReadiness(
      [hanging('a'), hanging('b'), hanging('c')],
      60
    );

    expect(report.checks.every((c) => c.status === 'timed_out')).toBe(true);
    // Serial execution would take ~180ms. Allow generous headroom for a loaded
    // machine while still failing a sequential implementation.
    expect(Date.now() - started).toBeLessThan(150);
  });

  it('never rejects, even when a probe throws synchronously', async () => {
    const exploding: Probe = {
      name: 'exploding',
      check: () => {
        throw new Error('thrown before returning a promise');
      },
    };

    await expect(evaluateReadiness([exploding])).resolves.toEqual(
      expect.objectContaining({ status: 'not_ready' })
    );
  });
});

describe('the firestore probe must not crash the process it is probing', () => {
  // Regression. The first implementation called listCollections()
  // unconditionally; on a container with no credentials the gRPC stub's own
  // `.catch(err => { throw err })` produced an unhandled rejection on a promise
  // this code never holds, and Node terminated. CI caught it. Neither .catch()
  // nor await can intercept that, so the unusable case has to be detected
  // before the call that triggers it.
  const credentialVars = [
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_SERVICE_ACCOUNT_BASE64',
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'FIRESTORE_EMULATOR_HOST',
  ] as const;

  it('recognises each credential source the Admin SDK accepts', () => {
    expect(hasFirebaseCredentialSource({})).toBe(false);
    for (const variable of credentialVars) {
      expect(hasFirebaseCredentialSource({ [variable]: 'set' })).toBe(true);
    }
  });

  it('fails the probe instead of calling Firestore when nothing is configured', async () => {
    const saved = new Map<string, string | undefined>();
    for (const variable of credentialVars) {
      saved.set(variable, process.env[variable]);
      delete process.env[variable];
    }

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const report = await evaluateReadiness([firestoreProbe]);

      // Reported as an ordinary failure. Reaching this assertion at all is the
      // proof: the unguarded version terminated the worker before it returned.
      expect(report.status).toBe('not_ready');
      expect(report.checks[0]).toEqual(
        expect.objectContaining({ name: 'firestore', status: 'failed' })
      );
    } finally {
      errorSpy.mockRestore();
      for (const [variable, value] of saved) {
        if (value === undefined) delete process.env[variable];
        else process.env[variable] = value;
      }
    }
  });
});

describe('GET /api/health/ready', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  it('answers 200 when dependencies are usable', async () => {
    const response = await request(appWith([ok('firestore')])).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
  });

  it('answers 503 — not 500 — when a dependency is unusable', async () => {
    const response = await request(appWith([failing('firestore')])).get(
      '/api/health/ready'
    );

    // The process is healthy; a dependency is not. 503 tells an orchestrator to
    // route around this instance, where 500 would suggest the request itself
    // was at fault and a restart would help.
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks[0].name).toBe('firestore');
  });

  it('does not leak dependency error text to the caller', async () => {
    const response = await request(appWith([failing('firestore')])).get(
      '/api/health/ready'
    );

    // Driver error strings are attacker-influenced and belong in the log only.
    expect(JSON.stringify(response.body)).not.toContain('refused the connection');
  });
});

describe('liveness and readiness are separate concerns', () => {
  it('keeps /api/health dependency-free so a sick dependency cannot trigger restarts', async () => {
    const response = await request(app).get('/api/health');

    // render.yaml points healthCheckPath here. If this ever starts consulting
    // Firestore, a database blip becomes a restart loop across every instance.
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks).toBeUndefined();
  });

  it('mounts readiness on the real app and reaches the emulator', async () => {
    const response = await request(app).get('/api/health/ready');

    // Integration, not a stub: this runs the real probes. The suite pins
    // FIRESTORE_EMULATOR_HOST, so firestore must answer; the storage probe is
    // config-only and setup-env sets no bucket, so not_ready is the honest
    // expectation here. What is being proved is that the route is wired and
    // each probe reports independently.
    expect([200, 503]).toContain(response.status);
    const names = response.body.checks.map((c: { name: string }) => c.name);
    expect(names).toEqual(['firestore', 'storage_bucket_configured']);

    const firestore = response.body.checks.find(
      (c: { name: string }) => c.name === 'firestore'
    );
    expect(firestore.status).toBe('ok');
  });
});
