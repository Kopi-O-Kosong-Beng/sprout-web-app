/**
 * Graceful shutdown behaviour.
 *
 * These drive `createShutdownHandler` with a fake server rather than binding a
 * port and signalling a real process: the branches worth proving are "what
 * happens when close() never calls back" and "what happens on a second
 * signal", and neither is reachable from a real SIGTERM without either killing
 * the test runner or waiting out a real ten-second timer.
 */
import { createShutdownHandler } from '../lifecycle';

interface FakeServer {
  close(callback: (error?: Error) => void): void;
  /** Fires the pending close callback — the drain finishing. */
  finish(error?: Error): void;
  closeCalls: number;
}

function fakeServer(): FakeServer {
  let pending: ((error?: Error) => void) | undefined;
  return {
    closeCalls: 0,
    close(callback) {
      this.closeCalls += 1;
      pending = callback;
    },
    finish(error) {
      pending?.(error);
    },
  };
}

describe('graceful shutdown', () => {
  it('stops accepting connections and exits 0 once the drain completes', () => {
    const server = fakeServer();
    const exits: number[] = [];
    const shutdown = createShutdownHandler(server, { exit: (c) => exits.push(c), log: () => {}, logError: () => {} });

    shutdown('SIGTERM');

    // close() is called immediately: new connections must stop being accepted
    // before we wait on the open ones.
    expect(server.closeCalls).toBe(1);
    // Still draining, so nothing has exited yet.
    expect(exits).toEqual([]);

    server.finish();
    expect(exits).toEqual([0]);
  });

  it('forces exit when connections outlive the drain timeout', () => {
    jest.useFakeTimers();
    try {
      const server = fakeServer();
      const exits: number[] = [];
      const shutdown = createShutdownHandler(server, {
        timeoutMs: 10_000,
        exit: (c) => exits.push(c),
        log: () => {},
        logError: () => {},
      });

      shutdown('SIGTERM');
      // A keep-alive connection that never ends: finish() is never called.
      jest.advanceTimersByTime(9_999);
      expect(exits).toEqual([]);

      jest.advanceTimersByTime(1);
      // Non-zero so an unclean stop is visible in the platform's logs rather
      // than looking like a healthy shutdown.
      expect(exits).toEqual([1]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not force-exit after a clean drain', () => {
    jest.useFakeTimers();
    try {
      const server = fakeServer();
      const exits: number[] = [];
      const shutdown = createShutdownHandler(server, {
        timeoutMs: 10_000,
        exit: (c) => exits.push(c),
        log: () => {},
        logError: () => {},
      });

      shutdown('SIGTERM');
      server.finish();
      expect(exits).toEqual([0]);

      // The force timer must have been cleared. Without clearTimeout this
      // would append a spurious 1 and the process would exit twice.
      jest.advanceTimersByTime(60_000);
      expect(exits).toEqual([0]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores repeat signals instead of closing twice', () => {
    const server = fakeServer();
    const exits: number[] = [];
    const shutdown = createShutdownHandler(server, { exit: (c) => exits.push(c), log: () => {}, logError: () => {} });

    shutdown('SIGTERM');
    // Platforms re-send SIGTERM, and an impatient operator sends a second
    // Ctrl-C. Both must be no-ops.
    shutdown('SIGTERM');
    shutdown('SIGINT');

    expect(server.closeCalls).toBe(1);

    server.finish();
    expect(exits).toEqual([0]);
  });

  it('exits non-zero when the server reports a close error', () => {
    const server = fakeServer();
    const exits: number[] = [];
    const shutdown = createShutdownHandler(server, { exit: (c) => exits.push(c), log: () => {}, logError: () => {} });

    shutdown('SIGTERM');
    server.finish(new Error('listener already closed'));

    expect(exits).toEqual([1]);
  });
});
