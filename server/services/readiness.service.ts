/**
 * Readiness probes — the "can this instance actually serve?" half of the
 * health contract.
 *
 * WHY THIS IS SEPARATE FROM /api/health, WHICH IS THE WHOLE POINT.
 *
 * `/api/health` answers liveness: is this process running? It returns 200
 * unconditionally and touches nothing. That is deliberately shallow, and it is
 * the endpoint `render.yaml` names as `healthCheckPath`.
 *
 * The tempting mistake is to make that endpoint check Firestore too, so a
 * broken dependency stops traffic. It backfires. The platform restarts an
 * instance that fails its health check, so a slow minute at Firestore would
 * restart every instance at once, and each replacement would fail the same
 * check on boot — a dependency blip amplified into a restart loop, with the
 * restarts making recovery slower. Liveness must depend only on the process.
 *
 * Readiness is the separate question, and it belongs on a separate path that
 * nothing is wired to restart. Kubernetes formalises exactly this split as
 * `livenessProbe` vs `readinessProbe`; this is that design without the cluster.
 *
 * Three rules:
 *
 *  1. NEVER THROW. Callers get a report, always. A readiness probe that can
 *     itself 500 tells an operator nothing about the dependency it was asked
 *     about.
 *  2. BOUND EVERY PROBE. A hung dependency must not hang the probe — that is
 *     the failure mode the endpoint exists to reveal, so it has to be reported
 *     as a timeout, not experienced as one.
 *  3. SAY WHAT FAILED, NOT WHY IN DETAIL. The response names the dependency
 *     and a coarse reason. Decoder and driver error text is
 *     attacker-influenced and belongs in the server log, the same rule the
 *     image ingest gate follows for player-facing messages.
 */
import { getDb } from '../firebase';

export type ProbeStatus = 'ok' | 'failed' | 'timed_out';

export interface ProbeResult {
  name: string;
  status: ProbeStatus;
  durationMs: number;
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: ProbeResult[];
  timestamp: string;
}

export interface Probe {
  name: string;
  /** Resolves when the dependency answered. Rejecting means "not usable". */
  check: () => Promise<unknown>;
}

export const DEFAULT_PROBE_TIMEOUT_MS = 2_500;

/**
 * Races a probe against the clock.
 *
 * The loser of the race is abandoned rather than cancelled — there is no
 * portable cancellation for an in-flight Firestore read. That is acceptable
 * here because the probe writes nothing: the worst case is one orphaned read
 * that resolves into a `.catch` nobody is waiting on. The attached no-op
 * handler is what stops that becoming an unhandled rejection.
 */
async function runProbe(probe: Probe, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<'timed_out'>((resolve) => {
    timer = setTimeout(() => resolve('timed_out'), timeoutMs);
    timer.unref?.();
  });

  // The async wrapper is load-bearing, not style. A probe that throws
  // *synchronously* — a config read that dereferences undefined, say — would
  // otherwise throw before `.then` was ever attached, escape this function, and
  // reject the whole Promise.all in evaluateReadiness. That breaks rule 1 for
  // the caller. Invoking inside an async IIFE turns a synchronous throw into a
  // rejection this handler can see. A test covers exactly this.
  const attempt = (async () => probe.check())().then(
    () => 'ok' as const,
    (error: unknown) => {
      console.error(
        `[readiness] probe "${probe.name}" failed:`,
        error instanceof Error ? error.message : error
      );
      return 'failed' as const;
    }
  );

  try {
    const settled = await Promise.race([attempt, timeout]);

    if (settled === 'timed_out') {
      console.error(`[readiness] probe "${probe.name}" exceeded ${timeoutMs}ms`);
    }

    return { name: probe.name, status: settled, durationMs: Date.now() - startedAt };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Runs every probe concurrently and reports the aggregate.
 *
 * Concurrently, not sequentially: probes are independent, and a serial run
 * would make the worst case the sum of the timeouts rather than the longest
 * one. Every probe is reported even when an earlier one already failed —
 * "Firestore is down" and "Firestore and Storage are both down" are different
 * operational situations and the endpoint should be able to tell them apart.
 */
export async function evaluateReadiness(
  probes: Probe[],
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ReadinessReport> {
  const checks = await Promise.all(probes.map((probe) => runProbe(probe, timeoutMs)));
  return {
    status: checks.every((check) => check.status === 'ok') ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Firestore reachability.
 *
 * `listCollections()` is a real round trip to the service and needs no
 * document, no index and no seeded data, so it works identically against the
 * emulator and against production. A `.get()` on some chosen collection would
 * have coupled readiness to that collection continuing to exist.
 */
export const firestoreProbe: Probe = {
  name: 'firestore',
  check: () => getDb().listCollections(),
};

/**
 * Sprite storage configuration.
 *
 * Config-only on purpose. `sprite-storage.ts` throws without this variable, so
 * a deploy that omits it breaks the entire scan-to-archive path (UC6 -> UC4)
 * at the first upload rather than at boot — exactly the silent misconfiguration
 * a readiness probe should surface. A live bucket round trip would be stronger
 * evidence but costs a Storage call on every probe, so the cheap check earns
 * its place and the report names it honestly.
 */
export const storageConfigProbe: Probe = {
  name: 'storage_bucket_configured',
  check: async () => {
    if (!process.env.FIREBASE_STORAGE_BUCKET) {
      throw new Error('FIREBASE_STORAGE_BUCKET is not set');
    }
  },
};

export function defaultProbes(): Probe[] {
  return [firestoreProbe, storageConfigProbe];
}
