/** Durable per-run observability reports.
 *
 *  The metrics store and the admin log buffer live in process memory, and
 *  Render replaces the process on every deploy — so the data the p95 decision
 *  needs (see requirements Req 12.9's "measure, then ratchet") would never
 *  accumulate past a deploy. This module writes ONE Firestore document per
 *  server run, `platform_run_reports/run-<startedAtMs>`, overwritten in place:
 *
 *   - every FLUSH_INTERVAL_MS, as insurance against crashes and SIGKILL,
 *   - and once more from the SIGTERM path (lifecycle.ts `flush`), which is the
 *     final and usually most complete write.
 *
 *  A run that recorded nothing — every dev restart before the first scan —
 *  writes nothing, so the collection holds only runs with something to say.
 *  `endedAt` is set only by the shutdown flush: a report whose endedAt is null
 *  is either the live run or one that died without a goodbye (crash/SIGKILL),
 *  and the export labels it accordingly.
 */
import { getDb } from '../firebase';
import { snapshotMetrics, type MetricsSnapshot } from './metricsStore';
import { adminLogBuffer, serverStartTime, type AdminLogEntry } from './adminStore';

const COLLECTION = 'platform_run_reports';
const FLUSH_INTERVAL_MS = 10 * 60 * 1000;
/** How many past runs the report endpoint ships. Bounded read — the collection
 *  itself can grow; configure a Firestore TTL on `updatedAt` if it ever needs
 *  pruning. */
const MAX_RUNS_RETURNED = 20;

export interface RunReport {
  id: string;
  startedAt: string;
  updatedAt: string;
  /** Set only by the shutdown flush. Null on the live run — and on a run that
   *  ended without one (crash or SIGKILL), where the report is whatever the
   *  last periodic flush captured. */
  endedAt: string | null;
  metrics: MetricsSnapshot;
  logs: AdminLogEntry[];
}

export function currentRunId(): string {
  return `run-${serverStartTime}`;
}

/** True when this run has anything worth archiving: any API call recorded, or
 *  any log line beyond the seeded boot message. */
export function hasReportableData(): boolean {
  return snapshotMetrics().apis.length > 0 || adminLogBuffer.length > 1;
}

export async function flushRunReport(final = false): Promise<boolean> {
  if (!hasReportableData()) return false;

  const now = new Date().toISOString();
  const report: Omit<RunReport, 'id'> = {
    startedAt: new Date(serverStartTime).toISOString(),
    updatedAt: now,
    endedAt: final ? now : null,
    metrics: snapshotMetrics(),
    // A copy, not the live array — the buffer keeps mutating after this.
    logs: [...adminLogBuffer],
  };
  // Firestore rejects `undefined` outright, and log entries carry their
  // optional fields as present-and-undefined keys (logAdminEvent always
  // includes `signature`/`latencyMs`). The round-trip drops exactly those;
  // everything in the report is plain JSON data, so nothing else changes.
  const storable = JSON.parse(JSON.stringify(report));
  await getDb().collection(COLLECTION).doc(currentRunId()).set(storable);
  return true;
}

export async function listRunReports(limit = MAX_RUNS_RETURNED): Promise<RunReport[]> {
  const snapshot = await getDb()
    .collection(COLLECTION)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      startedAt: String(data.startedAt ?? ''),
      updatedAt: String(data.updatedAt ?? ''),
      endedAt: (data.endedAt as string | null) ?? null,
      metrics: (data.metrics as MetricsSnapshot) ?? { timestamp: '', apis: [] },
      logs: (data.logs as AdminLogEntry[]) ?? [],
    };
  });
}

let periodicFlush: NodeJS.Timeout | null = null;

export function startPeriodicRunReportFlush(): void {
  if (periodicFlush) return;
  periodicFlush = setInterval(() => {
    flushRunReport(false).catch((error) =>
      console.warn(
        'Periodic run-report flush failed:',
        error instanceof Error ? error.message : String(error)
      )
    );
  }, FLUSH_INTERVAL_MS);
  // Insurance must never be the reason the process stays alive.
  periodicFlush.unref?.();
}

/** Test seam. */
export function stopPeriodicRunReportFlush(): void {
  if (periodicFlush) clearInterval(periodicFlush);
  periodicFlush = null;
}
