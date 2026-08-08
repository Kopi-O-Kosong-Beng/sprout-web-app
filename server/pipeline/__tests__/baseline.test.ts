import { describe, expect, it } from 'vitest';
import { runBaseline, formatBaseline } from '../fuzz/baseline';
import { makeImageSink } from '../fuzz/imageSink';

/**
 * The random-testing baseline, and the claim it exists to measure.
 *
 * Classical fuzzing starts by throwing random bytes at a target. The argument
 * for mutation-based fuzzing is that modern input validation rejects random
 * input long before it reaches anything interesting — so random testing tells
 * you nothing about a system like this one. That was asserted in the docs and
 * never measured; at L0 measuring it is free.
 *
 * 2,000 runs here rather than the documented 10,000: same result, a quarter of
 * the CI time. The 10,000-run figure is the one recorded in FUZZ_TESTING.md.
 */
const RUNS = 2_000;
const RNG_SEED = 1;

describe('random-testing baseline', () => {
  it(
    'rejects every random payload, and reports the survival rate',
    async () => {
      const report = await runBaseline({
        runs: RUNS,
        rngSeed: RNG_SEED,
        sink: makeImageSink('photo'),
      });

      // The headline. If this ever becomes non-zero, either the gate has
      // regressed or random input has become able to form a valid image —
      // and the second is not going to happen.
      expect(report.survivors, formatBaseline(report)).toBe(0);
      expect(report.survivalRate).toBe(0);
      expect(report.counts.crash).toBe(0);
      expect(report.counts.hang).toBe(0);
    },
    120_000
  );

  it(
    'exercises two distinct rules, not one rule many times',
    async () => {
      const report = await runBaseline({
        runs: RUNS,
        rngSeed: RNG_SEED,
        sink: makeImageSink('photo'),
      });

      /*
        The funnel is the actual result, not the zero. An earlier version drew
        random "printable" text from the base64 alphabet, so every payload was
        accidentally well-formed base64 and died at `unreadable` — the run
        measured one rule 9,999 times while reporting as though it had covered
        the gate. Both rules must carry real traffic.
      */
      expect(report.rejectedBy.not_base64).toBeGreaterThan(RUNS * 0.1);
      expect(report.rejectedBy.unreadable).toBeGreaterThan(RUNS * 0.1);
    },
    120_000
  );

  it('reproduces exactly when replayed with the same seed', async () => {
    const options = { runs: 100, rngSeed: 7, sink: makeImageSink('photo') };
    const first = await runBaseline(options);
    const second = await runBaseline(options);
    expect(second.rejectedBy).toEqual(first.rejectedBy);
    expect(second.survivors).toBe(first.survivors);
  }, 60_000);

  it('would notice a gate that let random bytes through', async () => {
    // The teeth check: the zero above is only meaningful if a non-zero is
    // reachable.
    const report = await runBaseline({
      runs: 50,
      rngSeed: 3,
      sink: async () => ({ accepted: true, detail: 'waved through' }),
    });

    expect(report.survivors).toBe(50);
    expect(report.survivalRate).toBe(1);
    expect(report.findings.length).toBe(50);
  }, 60_000);
});
