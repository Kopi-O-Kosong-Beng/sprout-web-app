/**
 * Graceful shutdown behaviour.
 *
 * These drive `createShutdownHandler` with a fake server rather than binding a
 * port and signalling a real process: the branches worth proving are "what
 * happens when close() never calls back" and "what happens on a second
 * signal", and neither is reachable from a real SIGTERM without either killing
 * the test runner or waiting out a real ten-second timer.
 */
import { createShutdownHandler, installUnhandledRejectionGuard } from '../lifecycle';

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

describe('unhandled rejection guard', () => {
  // Defence in depth for the failure CI found: a dependency rejecting a promise
  // this code never holds. Node's default is to terminate, which turns a logged
  // dependency error into an outage of a process that is otherwise healthy.
  const listenersBefore = process.listeners('unhandledRejection').slice();

  afterEach(() => {
    process.removeAllListeners('unhandledRejection');
    for (const listener of listenersBefore) {
      process.on('unhandledRejection', listener);
    }
  });

  it('logs the rejection and leaves the process running', () => {
    const logged: unknown[][] = [];
    installUnhandledRejectionGuard((message, error) => logged.push([message, error]));

    const listeners = process.listeners('unhandledRejection');
    const installed = listeners[listeners.length - 1] as (reason: unknown) => void;

    installed(new TypeError('stub credentials rejected'));

    expect(logged).toHaveLength(1);
    // The message must read as a defect, not as an acceptable outcome — this
    // handler keeps the server alive, it does not make the bug acceptable.
    expect(String(logged[0][0])).toContain('unhandled promise rejection');
    expect(String(logged[0][1])).toBe('TypeError: stub credentials rejected');
  });

  it('does not register an uncaughtException handler', () => {
    const before = process.listenerCount('uncaughtException');
    installUnhandledRejectionGuard(() => {});

    // Deliberate asymmetry. uncaughtException means the stack unwound
    // mid-operation and process state may be corrupt; that one should still end
    // the process.
    expect(process.listenerCount('uncaughtException')).toBe(before);
  });
});
