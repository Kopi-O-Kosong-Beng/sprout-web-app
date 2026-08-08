import { createServer, type Server } from 'node:net';

import {
  isEmulatorReachable,
  isFullSweep,
  missingEmulatorFailure,
  missingEmulatorWarning,
} from './require-emulator';

describe('isFullSweep', () => {
  it('treats a bare `jest --runInBand` as a full sweep', () => {
    expect(isFullSweep({ runTestsByPath: false, nonFlagArgs: [], testPathPattern: '' })).toBe(true);
  });

  it('treats --runTestsByPath as a targeted run (CI Group 1)', () => {
    expect(
      isFullSweep({
        runTestsByPath: true,
        nonFlagArgs: ['tests/battle-eligibility.test.ts'],
      })
    ).toBe(false);
  });

  it('treats positional path arguments as a targeted run', () => {
    expect(isFullSweep({ nonFlagArgs: ['tests/auth.test.ts'] })).toBe(false);
  });

  it('treats a --testPathPattern as a targeted run', () => {
    expect(isFullSweep({ testPathPattern: 'auth' })).toBe(false);
  });

  it('understands the jest 30 shape of testPathPatterns', () => {
    expect(isFullSweep({ testPathPatterns: { patterns: ['auth'] } })).toBe(false);
    expect(isFullSweep({ testPathPatterns: { patterns: [] } })).toBe(true);
  });
});

describe('emulator messages', () => {
  it('both name the wrapper script and the missing target', () => {
    for (const message of [
      missingEmulatorFailure('127.0.0.1:8080'),
      missingEmulatorWarning('127.0.0.1:8080'),
    ]) {
      expect(message).toContain('npm run test:jest:emulator');
      expect(message).toContain('127.0.0.1:8080');
    }
  });
});

describe('isEmulatorReachable', () => {
  let server: Server;
  let port: number;

  beforeAll((done) => {
    server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      port = typeof address === 'object' && address ? address.port : 0;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => done());
  });

  it('resolves true when something is listening', async () => {
    await expect(isEmulatorReachable(`127.0.0.1:${port}`)).resolves.toBe(true);
  });

  it('resolves false when nothing is listening', async () => {
    // Grab a port the OS just released so nothing is listening on it.
    const probe = createServer();
    const freePort = await new Promise<number>((resolve) => {
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const value = typeof address === 'object' && address ? address.port : 0;
        probe.close(() => resolve(value));
      });
    });
    await expect(isEmulatorReachable(`127.0.0.1:${freePort}`)).resolves.toBe(false);
  });
});
