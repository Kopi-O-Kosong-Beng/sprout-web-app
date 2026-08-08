import { describe, expect, it } from 'vitest';
import { makeImageSink } from '../fuzz/imageSink';
import { runFuzz, formatReport } from '../fuzz/runner';
import { loadSeedCorpus } from '../fuzz/seedCorpus';

/**
 * CI-mode fuzzing of the image ingest gate.
 *
 * Free and offline: the sink is `validateUploadedImage`, the same function
 * `/api/pipeline/run-stream` calls on every player scan. No external API is
 * touched, so this is safe to run on every PR and safe for a superadmin to
 * trigger from the studio's Unit Tests page.
 *
 * DETERMINISTIC BY CONSTRUCTION. The rng seed is fixed below, so the same
 * commit produces the same 300 mutations every run and a red build is
 * reproducible from the log alone. Change RNG_SEED to explore different
 * ground; changing it is a commit, which is the point — a fuzz suite that
 * silently varies makes "it passed yesterday" meaningless.
 *
 * The live-mode counterpart is scripts/fuzz-pipeline-live.ts, which is
 * deliberately NOT a vitest file: it costs API credits, and anything matching
 * this glob is one studio button-click away from running.
 */
const RNG_SEED = 42;
const RUNS = 300;

/** The contract under test: never throw, always answer. A thrown error escapes
 *  to the runner and is recorded as a crash. Both sinks deliver input the way
 *  the routes do — as a string — rather than handing Buffers straight in. */
const sink = makeImageSink('photo');

/** `/api/pipeline/run-stage2c` — the sprite echoed back through the studio's
 *  human gate. Same rules, different rejection copy. Fuzzed separately because
 *  "both entry points call the same validator" is a claim worth testing rather
 *  than assuming. */
const spriteSink = makeImageSink('sprite');

describe('image ingest fuzzing', () => {
  it(
    'survives mutated photographs without crashing, hanging, or misjudging them',
    async () => {
      const seeds = await loadSeedCorpus();
      expect(seeds.length).toBeGreaterThan(0);

      const report = await runFuzz({
        seeds,
        runs: RUNS,
        rngSeed: RNG_SEED,
        sink,
        /*
          Correctness, not just survival. Each mutant carries what the
          validator SHOULD do with it, so the run catches two failure modes a
          crash-only fuzzer cannot see: hostile input quietly accepted (a paid
          Plant.id call spent on garbage), and a genuine photo refused (a guard
          so strict it turns players away). Ambiguous mutants — a bitflip that
          may or may not land in the header — are marked 'either' and judged
          only on crashing or hanging.
        */
        // Generous: this is a hang detector, not a benchmark. The validator
        // does header parsing plus one bounded decode, measured at ~2ms.
        timeoutMs: 10_000,
      });

      if (report.findings.length > 0) {
        // The whole report, so CI's log is enough to triage from.
        console.error(formatReport(report));
      }

      expect(report.findings, formatReport(report)).toEqual([]);

      // A run that skipped everything would report zero findings and mean
      // nothing. Assert the corpus actually exercised the validator.
      expect(report.counts.ok).toBeGreaterThan(RUNS / 2);
    },
    120_000
  );

  /*
    The second entry point: /api/pipeline/run-stage2c, the sprite echoed back
    through the studio's human gate.

    Easy to mistake for internal traffic — the only caller is our own studio,
    replaying a sprite this server produced one request earlier. It is not.
    The pipeline router is behind authMiddleware but NOT requireSuperAdmin, so
    any verified account can POST arbitrary bytes here, and they land in
    Buffer.from(...,'base64') and then sharp.
  */
  it(
    'survives the same mutations on the sprite leg',
    async () => {
      const seeds = await loadSeedCorpus();

      const report = await runFuzz({
        seeds,
        runs: RUNS,
        rngSeed: RNG_SEED,
        sink: spriteSink,
        timeoutMs: 10_000,
      });

      if (report.findings.length > 0) console.error(formatReport(report));
      expect(report.findings, formatReport(report)).toEqual([]);
      expect(report.counts.ok).toBeGreaterThan(RUNS / 2);
    },
    120_000
  );

  /*
    Both legs must agree on the VERDICT and differ only in WORDING. If the two
    ever diverge on whether something is acceptable, one entry point has become
    a way around the other — which is precisely the hole that existed while
    stage2c had no validation at all.
  */
  it('reaches the same verdict on both legs, differing only in copy', async () => {
    const seeds = await loadSeedCorpus();
    const options = { seeds, runs: 60, rngSeed: 11, timeoutMs: 10_000 } as const;

    const photo = await runFuzz({ ...options, sink });
    const sprite = await runFuzz({ ...options, sink: spriteSink });

    expect(sprite.results.map((r) => [r.mutation, r.outcome])).toEqual(
      photo.results.map((r) => [r.mutation, r.outcome])
    );
  }, 120_000);

  /*
    Does the harness have teeth?

    A fuzz suite that cannot fail is decoration, and this one passes 300/300 on
    the real validator — which is either good news or a broken oracle, and from
    the outside those look identical. These two cases break the sink on purpose
    in each direction and assert the fuzzer notices.
  */
  it('detects a validator that accepts everything', async () => {
    const seeds = await loadSeedCorpus();
    const report = await runFuzz({
      seeds,
      runs: 60,
      rngSeed: 99,
      sink: async () => ({ accepted: true, detail: 'waved through' }),
    });

    // truncate / header_corrupt / not_an_image are all 'reject' mutants.
    expect(report.counts.silent_bad_output).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.detail.includes('accepted'))).toBe(true);
  }, 60_000);

  it('detects a validator that refuses everything', async () => {
    const seeds = await loadSeedCorpus();
    const report = await runFuzz({
      seeds,
      runs: 60,
      rngSeed: 99,
      sink: async () => ({ accepted: false, detail: 'refused' }),
    });

    // pixel_noise / exif_abuse / format_confusion-to-webp are 'accept' mutants,
    // so an over-strict guard is caught just as loudly as a leaky one.
    expect(report.counts.silent_bad_output).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.detail.includes('refused'))).toBe(true);
  }, 60_000);

  it('reports a sink that throws as a crash rather than letting it escape', async () => {
    const seeds = await loadSeedCorpus();
    const report = await runFuzz({
      seeds,
      runs: 10,
      rngSeed: 5,
      sink: async () => {
        throw new Error('decoder exploded');
      },
    });

    expect(report.counts.crash).toBe(10);
    expect(report.findings[0].detail).toContain('decoder exploded');
  }, 60_000);

  it('reproduces exactly when replayed with the same seed', async () => {
    const seeds = await loadSeedCorpus();
    const options = { seeds, runs: 25, rngSeed: 7, sink } as const;

    const first = await runFuzz({ ...options });
    const second = await runFuzz({ ...options });

    // The reproducibility guarantee the CI mode rests on: same seed, same
    // mutations, same verdicts. If this ever fails, a red build stops being
    // reproducible from its log and the suite loses most of its value.
    expect(second.results.map((r) => [r.seed, r.mutation, r.outcome])).toEqual(
      first.results.map((r) => [r.seed, r.mutation, r.outcome])
    );
  }, 60_000);
});
