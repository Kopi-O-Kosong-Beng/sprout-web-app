import { describe, expect, it } from 'vitest';
import {
  clampRuns,
  isFuzzSuite,
  isFuzzRunInFlight,
  runIngestFuzz,
  FUZZ_SUITES,
  MIN_FUZZ_RUNS,
  MAX_FUZZ_RUNS,
  DEFAULT_FUZZ_RUNS,
} from '../../platform/fuzzRunner';

/**
 * The studio's in-process fuzz runner.
 *
 * Previously untested — the only references anywhere were CLIENT tests that
 * mock the endpoint, which assert nothing about the server. That matters more
 * than it looks: this module sits behind a superadmin Run button that spawns
 * CPU-bound sharp decoding on a 512MB instance, so its input clamping is the
 * thing standing between a hand-edited request and an OOM-killed container.
 *
 * Free and offline, like everything else it drives.
 */
describe('fuzz runner: input clamping', () => {
  it('raises a too-small run count to the floor', () => {
    expect(clampRuns(0)).toBe(MIN_FUZZ_RUNS);
    expect(clampRuns(1)).toBe(MIN_FUZZ_RUNS);
    expect(clampRuns(-500)).toBe(MIN_FUZZ_RUNS);
  });

  /* The ceiling is the OOM guard. A request asking for a million mutations
     must come back as 10,000, not as a server that stops responding. */
  it('lowers a too-large run count to the ceiling', () => {
    expect(clampRuns(10_001)).toBe(MAX_FUZZ_RUNS);
    expect(clampRuns(1_000_000)).toBe(MAX_FUZZ_RUNS);
  });

  it('keeps a value already inside the range, floored to an integer', () => {
    expect(clampRuns(300)).toBe(300);
    expect(clampRuns(300.9)).toBe(300);
    expect(clampRuns(MIN_FUZZ_RUNS)).toBe(MIN_FUZZ_RUNS);
    expect(clampRuns(MAX_FUZZ_RUNS)).toBe(MAX_FUZZ_RUNS);
  });

  /* JSON bodies are not typed. `{"runs": "abc"}` reaches here as NaN, and
     NaN silently defeats Math.min/Math.max — so this is the case that would
     have produced a runs=NaN loop rather than a clamped one. */
  it('falls back to the default when the value is not a finite number', () => {
    expect(clampRuns(Number.NaN)).toBe(DEFAULT_FUZZ_RUNS);
    expect(clampRuns(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FUZZ_RUNS);
    expect(clampRuns(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_FUZZ_RUNS);
  });
});

describe('fuzz runner: suite validation', () => {
  it('accepts exactly the three built suites', () => {
    for (const suite of FUZZ_SUITES) {
      expect(isFuzzSuite(suite), suite).toBe(true);
    }
    expect(FUZZ_SUITES).toEqual(['mutation', 'baseline', 'text']);
  });

  /* The guard is what stops an arbitrary string reaching the switch in
     execute() and falling through to the mutation branch by accident. */
  it('refuses anything else, including non-strings', () => {
    for (const value of ['', 'Mutation', 'live', 'text ', 42, null, undefined, {}, []]) {
      expect(isFuzzSuite(value), String(value)).toBe(false);
    }
  });
});

describe('fuzz runner: execution', () => {
  it('runs the text suite and reports it green', async () => {
    const summary = await runIngestFuzz({ suite: 'text' });

    expect(summary.suite).toBe('text');
    expect(summary.ok).toBe(true);
    expect(summary.text?.totalCases).toBeGreaterThan(80);
    expect(summary.text?.findings).toEqual([]);
    // The ReDoS bound is the assertion the text suite exists to keep; a report
    // that lost the figure would hide the bound moving.
    expect(summary.text?.slowestMs).toBeLessThan(250);
    // One suite per run: a text report must not arrive carrying image fields.
    expect(summary.mutation).toBeUndefined();
    expect(summary.baseline).toBeUndefined();
  }, 30_000);

  it('runs the baseline suite, clamping a below-floor request', async () => {
    const summary = await runIngestFuzz({ suite: 'baseline', runs: 1, rngSeed: 1 });

    expect(summary.suite).toBe('baseline');
    expect(summary.baseline?.runs).toBe(MIN_FUZZ_RUNS);
    // The headline claim, at small scale: random payloads do not survive.
    expect(summary.baseline?.survivors).toBe(0);
    expect(summary.ok).toBe(true);
  }, 30_000);

  it('defaults to the mutation suite when none is named', async () => {
    const summary = await runIngestFuzz({ runs: 10, rngSeed: 42 });

    expect(summary.suite).toBe('mutation');
    expect(summary.mutation?.runs).toBe(10);
    expect(summary.mutation?.seedCorpus.length).toBeGreaterThan(0);
    // A supplied seed is a replay, and the report says so — that flag is what
    // tells an operator whether the run can be reproduced.
    expect(summary.mutation?.deterministic).toBe(true);
  }, 60_000);

  /*
    Single-flight, and why it is not merely tidy.

    The image suites are CPU-bound decoding on a 512MB box. Two concurrent runs
    would not halve the time, they would make both slow and double peak RSS —
    which is the failure the extreme_resize rewrite was about. The guard
    returns the IN-FLIGHT promise rather than starting a second run.
  */
  it('serialises concurrent runs onto one in-flight promise', async () => {
    expect(isFuzzRunInFlight()).toBe(false);

    const first = runIngestFuzz({ suite: 'text' });
    const second = runIngestFuzz({ suite: 'text' });

    expect(second).toBe(first);
    expect(isFuzzRunInFlight()).toBe(true);

    await first;
    // Released afterwards, or the page would refuse every later run with a 409.
    expect(isFuzzRunInFlight()).toBe(false);
  }, 30_000);
});
