/** In-memory per-API call metrics for the studio's observability page.
 *
 *  Same lifetime and honesty rules as the admin log buffer next door: process
 *  memory only, reset on restart, and fed exclusively by real calls — nothing
 *  is seeded, so an empty chart means no scans have run, not "loading".
 *
 *  Keyed by provider rather than by pipeline hop, because that is the question
 *  an admin brings here: "which API is slow / failing", not "which step".
 */

export interface ApiCallSample {
  /** Epoch millis when the call finished. */
  at: number;
  latencyMs: number;
  /** False when the hop fell back or degraded (mock identification, prompt
   *  fallback tier, passthrough cutout, defaulted judge) — the pipeline still
   *  succeeded, but this provider did not deliver. */
  ok: boolean;
}

interface ApiSeries {
  samples: ApiCallSample[];
  totalRequests: number;
  totalErrors: number;
}

/** Rolling window per API. Big enough to chart a day of demo traffic, small
 *  enough to never matter in memory. */
const MAX_SAMPLES = 200;
/** How many raw samples the endpoint ships for sparklines. */
const RECENT_SAMPLES = 40;

const series = new Map<string, ApiSeries>();

export function recordApiCall(api: string, latencyMs: number, ok: boolean): void {
  let entry = series.get(api);
  if (!entry) {
    entry = { samples: [], totalRequests: 0, totalErrors: 0 };
    series.set(api, entry);
  }
  entry.totalRequests++;
  if (!ok) entry.totalErrors++;
  entry.samples.push({ at: Date.now(), latencyMs: Math.max(0, Math.round(latencyMs)), ok });
  if (entry.samples.length > MAX_SAMPLES) entry.samples.shift();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export interface ApiMetrics {
  api: string;
  requests: number;
  errors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number | null;
  lastAt: number | null;
  recent: ApiCallSample[];
}

export interface MetricsSnapshot {
  timestamp: string;
  /** Sorted slowest-first by p95, which is the order the "slowest API" chart
   *  wants and a sensible default for every other view. */
  apis: ApiMetrics[];
}

export function snapshotMetrics(): MetricsSnapshot {
  const apis: ApiMetrics[] = [];
  for (const [api, entry] of series) {
    const latencies = entry.samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
    const sum = latencies.reduce((total, value) => total + value, 0);
    const last = entry.samples[entry.samples.length - 1] ?? null;
    apis.push({
      api,
      requests: entry.totalRequests,
      errors: entry.totalErrors,
      avgMs: latencies.length ? Math.round(sum / latencies.length) : 0,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      maxMs: latencies.length ? latencies[latencies.length - 1] : 0,
      lastMs: last?.latencyMs ?? null,
      lastAt: last?.at ?? null,
      recent: entry.samples.slice(-RECENT_SAMPLES),
    });
  }
  apis.sort((a, b) => b.p95Ms - a.p95Ms);
  return { timestamp: new Date().toISOString(), apis };
}

/** Test seam. Not called by production code. */
export function resetMetricsForTest(): void {
  series.clear();
}
