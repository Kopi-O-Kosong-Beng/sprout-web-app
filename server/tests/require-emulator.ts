/**
 * Jest globalSetup: refuse to start a doomed run when the Firestore Emulator
 * is absent.
 *
 * tests/setup-env.ts points every suite at FIRESTORE_EMULATOR_HOST
 * unconditionally. When nothing is listening there, the Firestore client does
 * not fail — it retries, so each `beforeEach(clearFirestore)` burns its full
 * 15s timeout and the run limps on for ten minutes before reporting a wall of
 * unrelated-looking hook timeouts. Nothing in that output mentions the
 * emulator, so the natural read is "the tests are broken".
 *
 * This probes the port once, in about a millisecond, and then:
 *
 *   - FULL SWEEP (bare `jest`, i.e. `npm run test:jest`): FAIL immediately.
 *     A full sweep always includes emulator-backed suites, so without the
 *     emulator it can only end in that wall of timeouts. Failing here turns a
 *     silent 10+ minute hang into an instant message naming the fix.
 *
 *   - TARGETED RUN (explicit paths or a path pattern): warn but continue.
 *     Plenty of suites need no emulator at all — CI's "Group 1" runs exactly
 *     those with `--runTestsByPath`, outside `firebase emulators:exec` — and
 *     hard-failing would break them to improve an error message.
 */
import { createConnection } from 'node:net';

const DEFAULT_HOST = '127.0.0.1:8080';
const PROBE_TIMEOUT_MS = 500;
const WRAPPER_HINT = 'npm run test:jest:emulator   (from server/; add -w server from the repo root)';

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

/** The slice of jest's globalConfig that reveals how tests were selected. */
export interface TestSelection {
  runTestsByPath?: boolean;
  nonFlagArgs?: string[];
  testPathPattern?: string;
  // jest 30 replaces testPathPattern with an object holding `patterns`.
  testPathPatterns?: { patterns?: string[] };
}

/**
 * True when nothing narrowed the run — every suite will execute, including
 * the emulator-backed ones. Any explicit selection (paths, --runTestsByPath,
 * a path pattern) means the caller chose their suites deliberately.
 */
export function isFullSweep(selection: TestSelection): boolean {
  if (selection.runTestsByPath) return false;
  if (selection.nonFlagArgs && selection.nonFlagArgs.length > 0) return false;
  if (selection.testPathPattern) return false;
  const patterns = selection.testPathPatterns?.patterns;
  if (patterns && patterns.length > 0) return false;
  return true;
}

const rule = '='.repeat(72);

export function missingEmulatorFailure(target: string): string {
  return [
    `No Firestore Emulator at ${target} — refusing to start a full jest sweep.`,
    '',
    '  Most suites here need the emulator. Without it they do not fail —',
    '  every Firestore call RETRIES until its 15s hook timeout, so the run',
    '  hangs for ten-plus minutes and then reports a wall of hook timeouts',
    '  that never mention the emulator.',
    '',
    '  Run the wrapper instead, which starts the emulator for you:',
    '',
    `      ${WRAPPER_HINT}`,
    '',
    '  To run only suites that need no emulator, name them explicitly',
    '  (e.g. `jest --runTestsByPath tests/battle-eligibility.test.ts`);',
    '  targeted runs get a warning instead of this failure.',
  ].join('\n');
}

export function missingEmulatorWarning(target: string): string {
  return [
    '',
    rule,
    `  NO FIRESTORE EMULATOR at ${target}`,
    '',
    '  Suites that touch Firestore will not fail here — they will RETRY,',
    '  time out after 15s each, and report as hook timeouts that say',
    '  nothing about the emulator. Suites that need no emulator are',
    '  unaffected and will run normally.',
    '',
    '  The wrapper starts the emulator for you:',
    '',
    `      ${WRAPPER_HINT}`,
    rule,
    '',
  ].join('\n');
}

export default async function requireEmulator(
  globalConfig: TestSelection = {}
): Promise<void> {
  const target = process.env.FIRESTORE_EMULATOR_HOST ?? DEFAULT_HOST;
  if (await isEmulatorReachable(target)) return;

  if (isFullSweep(globalConfig)) {
    throw new Error(missingEmulatorFailure(target));
  }
  process.stderr.write(missingEmulatorWarning(target));
}
