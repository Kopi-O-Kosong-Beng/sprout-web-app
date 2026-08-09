/** Firestore-emulator tests for the per-run observability archive — the piece
 *  that lets the export report cover runs from before the last server reset. */
import { getDb } from '../firebase';
import {
  currentRunId,
  flushRunReport,
  hasReportableData,
  listRunReports,
} from '../platform/metricsArchive';
import { recordApiCall, resetMetricsForTest } from '../platform/metricsStore';
import { adminLogBuffer, logAdminEvent } from '../platform/adminStore';
import { clearFirestore } from './firestore-test-utils';

const COLLECTION = 'platform_run_reports';

beforeEach(async () => {
  await clearFirestore();
  resetMetricsForTest();
  // Back to the single seeded boot line — the "nothing has happened" state.
  adminLogBuffer.length = 1;
});

describe('metricsArchive', () => {
  it('writes nothing for a run that recorded nothing', async () => {
    // Every dev restart before the first scan hits this path; the collection
    // must hold only runs with something to say.
    expect(hasReportableData()).toBe(false);
    expect(await flushRunReport()).toBe(false);
    const snapshot = await getDb().collection(COLLECTION).get();
    expect(snapshot.empty).toBe(true);
  });

  it('persists metrics and logs once there is something to report', async () => {
    recordApiCall('Plant.id', 1200, true);
    logAdminEvent('info', 'Hop 1 — Identify', 'Identified as "Fern" (97% confidence)');

    expect(await flushRunReport()).toBe(true);

    const doc = await getDb().collection(COLLECTION).doc(currentRunId()).get();
    expect(doc.exists).toBe(true);
    const data = doc.data()!;
    expect(data.endedAt).toBeNull(); // periodic flush — the run is still live
    expect(data.metrics.apis[0].api).toBe('Plant.id');
    expect(data.logs.some((l: { message: string }) => l.message.includes('Fern'))).toBe(true);
  });

  it('overwrites the same document per run, and the final flush stamps endedAt', async () => {
    recordApiCall('Flux', 9000, true);
    await flushRunReport();
    recordApiCall('Flux', 11000, true);
    await flushRunReport(true);

    const snapshot = await getDb().collection(COLLECTION).get();
    // One run, one document — however many flushes happened.
    expect(snapshot.size).toBe(1);
    const data = snapshot.docs[0].data();
    expect(data.endedAt).not.toBeNull();
    expect(data.metrics.apis[0].requests).toBe(2);
  });

  it('lists runs newest-first for the report endpoint', async () => {
    // Two hand-planted past runs plus this one.
    await getDb().collection(COLLECTION).doc('run-1000').set({
      startedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T01:00:00.000Z',
      endedAt: '2026-08-01T01:00:00.000Z',
      metrics: { timestamp: '2026-08-01T01:00:00.000Z', apis: [] },
      logs: [],
    });
    await getDb().collection(COLLECTION).doc('run-2000').set({
      startedAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T01:00:00.000Z',
      endedAt: null,
      metrics: { timestamp: '2026-08-05T01:00:00.000Z', apis: [] },
      logs: [],
    });
    recordApiCall('withoutBG', 3000, true);
    await flushRunReport();

    const runs = await listRunReports();
    expect(runs).toHaveLength(3);
    expect(runs[0].id).toBe(currentRunId());
    expect(runs[1].id).toBe('run-2000');
    expect(runs[2].id).toBe('run-1000');
    // A run that died without a shutdown flush is recognisable by endedAt.
    expect(runs[1].endedAt).toBeNull();
    expect(runs[2].endedAt).not.toBeNull();
  });
});
