/**
 * The readiness route.
 *
 * A factory rather than a router instance, because the probe list is the thing
 * worth substituting in a test. The same injection style the battle repository
 * uses for `runTransaction`: production calls it with no arguments and gets the
 * real dependencies, a test passes fakes and drives every branch without an
 * emulator.
 *
 * Status codes are the contract an orchestrator reads, so they are chosen for
 * a machine first:
 *   200 — every probe answered. Send this instance traffic.
 *   503 — at least one dependency is unusable. Route around it; the instance
 *         is not broken, so restarting it would not help and might hurt.
 * 503 (not 500) because the process is fine — it is a dependency that is not.
 */
import type { RequestHandler } from 'express';
import {
  DEFAULT_PROBE_TIMEOUT_MS,
  defaultProbes,
  evaluateReadiness,
  type Probe,
} from '../services/readiness.service';

export function createReadinessHandler(
  probes: Probe[] = defaultProbes(),
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): RequestHandler {
  return (_req, res, next) => {
    evaluateReadiness(probes, timeoutMs)
      .then((report) => {
        res.status(report.status === 'ready' ? 200 : 503).json(report);
      })
      // evaluateReadiness is written not to reject, so reaching here means a
      // defect in the probe machinery itself rather than a sick dependency.
      // That is a real 500 and belongs with every other unhandled error.
      .catch(next);
  };
}
