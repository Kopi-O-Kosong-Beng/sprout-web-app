import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordApiCall,
  resetMetricsForTest,
  snapshotMetrics,
} from '../../platform/metricsStore';

describe('metricsStore', () => {
  beforeEach(() => resetMetricsForTest());

  it('[black-box] starts empty — nothing is seeded', () => {
    // The observability page treats "no data" as "no scans have run". A seeded
    // sample would turn that honest emptiness back into the fake-logs problem.
    expect(snapshotMetrics().apis).toEqual([]);
  });

  it('[black-box] aggregates requests, errors and latency stats per API', () => {
    recordApiCall('Plant.id', 100, true);
    recordApiCall('Plant.id', 300, true);
    recordApiCall('Plant.id', 200, false);

    const [api] = snapshotMetrics().apis;
    expect(api.api).toBe('Plant.id');
    expect(api.requests).toBe(3);
    expect(api.errors).toBe(1);
    expect(api.avgMs).toBe(200);
    expect(api.maxMs).toBe(300);
    expect(api.lastMs).toBe(200);
    expect(api.recent).toHaveLength(3);
  });

  it('[black-box] sorts slowest-first by p95, which is the chart order', () => {
    recordApiCall('fast', 10, true);
    recordApiCall('slow', 9000, true);
    recordApiCall('middling', 500, true);

    expect(snapshotMetrics().apis.map((a) => a.api)).toEqual([
      'slow',
      'middling',
      'fast',
    ]);
  });

  it('[white-box: boundary] p50/p95 come from the sorted sample set', () => {
    for (let i = 1; i <= 100; i++) recordApiCall('api', i * 10, true);

    const [api] = snapshotMetrics().apis;
    expect(api.p50Ms).toBe(500);
    expect(api.p95Ms).toBe(950);
  });

  it('[white-box] caps the rolling window without losing lifetime totals', () => {
    for (let i = 0; i < 250; i++) recordApiCall('api', 5, i % 10 !== 0);

    const [api] = snapshotMetrics().apis;
    // Totals are lifetime counters; the sample window is bounded separately.
    expect(api.requests).toBe(250);
    expect(api.errors).toBe(25);
    expect(api.recent.length).toBeLessThanOrEqual(40);
  });

  it('[black-box] a single sample yields sane stats rather than NaN', () => {
    recordApiCall('one-shot', 1234, true);
    const [api] = snapshotMetrics().apis;
    expect(api.p50Ms).toBe(1234);
    expect(api.p95Ms).toBe(1234);
    expect(api.avgMs).toBe(1234);
  });
});
