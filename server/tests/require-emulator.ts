/**
 * Jest globalSetup: say so, immediately, when the Firestore Emulator is absent.
 *
 * tests/setup-env.ts points every suite at FIRESTORE_EMULATOR_HOST
 * unconditionally. When nothing is listening there, the Firestore client does
 * not fail — it retries, so each `beforeEach(clearFirestore)` burns its full
 * 15s timeout and the run limps on for ten minutes before reporting a wall of
 * unrelated-looking hook timeouts. Nothing in that output mentions the
 * emulator, so the natural read is "the tests are broken".
 *
 * This probes the port once, in about a millisecond, and prints the one
 * sentence that would have saved the trouble.
 *
 * A WARNING, NOT A FAILURE, and that is deliberate. Plenty of suites here need
 * no emulator at all — CI's "Group 1" and "Group 10" run precisely those,
 * outside `firebase emulators:exec`, and so do the pipeline and fuzz suites.
 * Hard-failing would break every one of them to improve an error message.
 */
import { createConnection } from 'node:net';

const DEFAULT_HOST = '127.0.0.1:8080';
const PROBE_TIMEOUT_MS = 500;

function parseHost(raw: string): { host: string; port: number } {
  const [host, port] = raw.split(':');
  return { host: host || '127.0.0.1', port: Number(port) || 8080 };
}

/** Resolves true when something accepts a TCP connection on the emulator port. */
export function isEmulatorReachable(
  target: string,
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> {
  const { host, port } = parseHost(target);
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    // Every path resolves exactly once, and the socket is always destroyed —
    // a lingering handle here would hold the whole jest run open.
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

export default async function requireEmulator(): Promise<void> {
  const target = process.env.FIRESTORE_EMULATOR_HOST ?? DEFAULT_HOST;
  if (await isEmulatorReachable(target)) return;

  // Written to stderr rather than thrown: see the header. It has to survive
  // jest's own output, hence the rule above and below.
  const rule = '='.repeat(72);
  process.stderr.write(
    [
      '',
      rule,
      `  NO FIRESTORE EMULATOR at ${target}`,
      '',
      '  Suites that touch Firestore will not fail here — they will RETRY,',
      '  time out after 15s each, and report as hook timeouts that say',
      '  nothing about the emulator. Expect a very slow, very confusing run.',
      '',
      '  Run the wrapper instead, which starts the emulator for you:',
      '',
      '      npm run test:jest:emulator -w server',
      '',
      '  Suites that need no emulator (the pipeline, fuzz and pure-unit ones)',
      '  are unaffected and will run normally.',
      rule,
      '',
    ].join('\n')
  );
}
