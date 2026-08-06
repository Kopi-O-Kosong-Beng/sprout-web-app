/**
 * Graceful shutdown — 12-factor IX (Disposability).
 *
 * Every platform that runs this process stops it the same way: send SIGTERM,
 * wait a grace period, then SIGKILL. Render does it on each redeploy, `docker
 * stop` does it, and a Kubernetes eviction does it. Until this existed,
 * server.ts was `app.listen()` and nothing else, so the default SIGTERM
 * behaviour applied — immediate termination, dropping every request still in
 * flight. A battle turn interrupted there loses its HTTP response even though
 * the Firestore transaction may already have committed, which is the one case
 * the client's `expectedTurn` retry exists to survive. Draining first means it
 * usually does not have to.
 *
 * Three rules, and each is a decision rather than a default:
 *
 *  1. STOP ACCEPTING, THEN FINISH WHAT IS OPEN. `server.close()` closes the
 *     listener immediately and fires its callback once existing connections
 *     end. New traffic is already being routed elsewhere by the platform at
 *     this point, so there is nothing to lose by refusing it and something to
 *     lose by cutting off a request mid-write.
 *
 *  2. NEVER DRAIN FOREVER. A keep-alive connection that never closes would
 *     hold the container open until the platform's SIGKILL, turning a clean
 *     stop into a hard kill and a confusing 30-second deploy. The timer bounds
 *     that, and exits non-zero so the cause is visible in the logs rather than
 *     looking like a healthy stop.
 *
 *  3. IGNORE REPEAT SIGNALS. Platforms re-send SIGTERM, and an impatient
 *     operator sends a second Ctrl-C. Re-entering the handler would call
 *     `close()` on an already-closing server and schedule a second exit timer.
 *     The guard makes shutdown idempotent.
 *
 * The timer is `unref()`d so that if draining finishes quickly the pending
 * timeout cannot itself keep the event loop alive — the very thing this module
 * exists to prevent.
 */

/** The slice of `http.Server` this needs. Narrow on purpose: a test supplies a
 *  plain object rather than binding a real port. */
export interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
}

export interface ShutdownOptions {
  /** How long to let open connections finish before forcing exit. */
  timeoutMs?: number;
  /** Injected so tests observe the code instead of killing the runner. */
  exit?: (code: number) => void;
  log?: (message: string) => void;
  logError?: (message: string) => void;
}

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Builds the signal handler. Returns a function per process, not per signal:
 * the `settled` flag it closes over is what makes repeat signals harmless, so
 * SIGTERM and SIGINT must share one instance.
 */
export function createShutdownHandler(
  server: ClosableServer,
  options: ShutdownOptions = {}
): (signal: string) => void {
  const {
    timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    exit = (code: number) => process.exit(code),
    log = (message: string) => console.log(message),
    logError = (message: string) => console.error(message),
  } = options;

  let settled = false;

  return function shutdown(signal: string): void {
    if (settled) {
      log(`[lifecycle] ${signal} received while already shutting down — ignored`);
      return;
    }
    settled = true;

    log(`[lifecycle] ${signal} received — refusing new connections, draining open ones`);

    const forceTimer = setTimeout(() => {
      logError(
        `[lifecycle] connections still open after ${timeoutMs}ms — forcing exit`
      );
      exit(1);
    }, timeoutMs);
    // A pending timer must not be the reason the process stays alive.
    forceTimer.unref?.();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        logError(`[lifecycle] server did not close cleanly: ${error.message}`);
        exit(1);
        return;
      }
      log('[lifecycle] drained cleanly');
      exit(0);
    });
  };
}

/** Wires SIGTERM and SIGINT to one shared handler. */
export function installShutdownHandlers(
  server: ClosableServer,
  options: ShutdownOptions = {}
): (signal: string) => void {
  const shutdown = createShutdownHandler(server, options);
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

/**
 * Last-resort guard for rejections nothing else can catch.
 *
 * Node terminates on an unhandled rejection by default, and a dependency can
 * produce one on a promise this code never holds. The concrete case: calling
 * Firestore lazily creates a gRPC stub, and google-gax's generated client
 * attaches `.catch(err => { throw err })` to that stub promise — so a failed
 * credential lookup rethrows into nothing and kills the process. CI caught
 * exactly that, via a readiness probe, on a container started without
 * credentials.
 *
 * The specific case is now prevented at its source (see
 * services/readiness.service.ts). This stays because the general shape will
 * recur: a third-party client, an async path nobody anticipated, and a web
 * server dying for a reason unrelated to the request it was serving.
 *
 * WHY THIS DOES NOT EXIT, WHEN THE USUAL ADVICE IS TO EXIT. That advice is
 * about `uncaughtException`, where the stack unwound mid-operation and process
 * state may genuinely be corrupt. A rejected promise in a background client is
 * different: no request handler was interrupted, no invariant was half-applied,
 * and every piece of durable state lives in Firestore rather than in this
 * process. Terminating would convert a logged dependency error into an outage.
 * `uncaughtException` is deliberately NOT handled here — that one should still
 * end the process.
 *
 * Installed from server.ts only, never from app.ts, so tests importing the app
 * still surface unhandled rejections as failures.
 */
export function installUnhandledRejectionGuard(
  log: (message: string, error: unknown) => void = (message, error) =>
    console.error(message, error)
): void {
  process.on('unhandledRejection', (reason) => {
    log(
      '[lifecycle] unhandled promise rejection — continuing to serve; this is a defect, not a shrug:',
      reason instanceof Error ? `${reason.name}: ${reason.message}` : reason
    );
  });
}
