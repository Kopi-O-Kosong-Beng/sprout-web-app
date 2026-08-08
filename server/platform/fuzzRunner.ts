/**
 * The fuzz runs behind the studio's Fuzz Testing page.
 *
 * Runs IN-PROCESS rather than shelling vitest, which the Unit Tests page does.
 * That is the whole reason this exists: each harness produces a structured
 * report — rng seed, outcome tallies, per-strategy breakdown, findings with
 * replay coordinates — and spawning vitest would flatten all of it into
 * "1 passed" plus a wall of terminal text.
 *
 * Three suites, all free and offline:
 *
 *   mutation  mutate real plant photos, feed them to the ingest gate
 *   baseline  10k random payloads, measuring how many survive that gate
 *   text      the contact and ticket validators: injection, boundaries,
 *             email grammar, ReDoS timing
 *
 * SAFETY: nothing here can reach a paid provider. The image suites import only
 * the ingest gate; the text suite imports only Joi schemas. That is deliberate
 * rather than incidental — a page with a Run button must not be able to spend
 * API credits. The paid path lives in scripts/fuzz-pipeline-live.ts, is not a
 * vitest file, is not under the studio test glob, and refuses to start without
 * --confirm-spend.
 */
import { runFuzz, type FuzzOutcome } from '../pipeline/fuzz/runner';
import { loadSeedCorpus } from '../pipeline/fuzz/seedCorpus';
import { makeImageSink } from '../pipeline/fuzz/imageSink';
import { runBaseline } from '../pipeline/fuzz/baseline';
import { runTextFuzz, type TextOutcome } from '../pipeline/fuzz/text/textFuzz';

export const FUZZ_SUITES = ['mutation', 'baseline', 'text'] as const;
export type FuzzSuite = (typeof FUZZ_SUITES)[number];

export function isFuzzSuite(value: unknown): value is FuzzSuite {
  return typeof value === 'string' && (FUZZ_SUITES as readonly string[]).includes(value);
}

/** Bounds on what the page may ask for. The upper bound guards against a
 *  hand-edited request tying the server up. */
export const MIN_FUZZ_RUNS = 10;
export const MAX_FUZZ_RUNS = 10_000;
export const DEFAULT_FUZZ_RUNS = 300;
/** The baseline is much cheaper per run (no image decode), so it defaults
 *  higher — 10,000 is the figure quoted in FUZZ_TESTING.md. */
export const DEFAULT_BASELINE_RUNS = 10_000;

export interface FuzzFinding {
  seed: string;
  mutation: string;
  outcome: string;
  detail: string;
  iteration: number;
}

export interface MutationSummary {
  runs: number;
  rngSeed: number;
  deterministic: boolean;
  seedCorpus: string[];
  counts: Record<FuzzOutcome, number>;
  byMutation: Record<string, Partial<Record<FuzzOutcome, number>>>;
  findings: FuzzFinding[];
}

export interface BaselineSummary {
  runs: number;
  rngSeed: number;
  survivors: number;
  survivalRate: number;
  /** Which rule stopped each payload. The funnel is the real result — a single
   *  rule catching everything would mean the run measured one thing many
   *  times rather than covering the gate. */
  rejectedBy: Record<string, number>;
}

export interface TextSummary {
  totalCases: number;
  counts: Record<TextOutcome, number>;
  slowestMs: number;
  /** Per-suite tallies (injection, boundary, email grammar, redos, …). */
  bySuite: Record<string, Partial<Record<TextOutcome, number>>>;
  findings: {
    suite: string;
    field: string;
    label: string;
    outcome: string;
    expected: string;
    actual: string;
    probes: string;
    detail: string;
  }[];
}

export interface FuzzRunSummary {
  suite: FuzzSuite;
  ok: boolean;
  startedAt: string;
  durationMs: number;
  mutation?: MutationSummary;
  baseline?: BaselineSummary;
  text?: TextSummary;
}

/** One run at a time, across all suites. The image work is CPU-bound
 *  decoding; two concurrent runs would just make both slow. */
let inFlight: Promise<FuzzRunSummary> | null = null;

export function isFuzzRunInFlight(): boolean {
  return inFlight !== null;
}

export interface FuzzRunRequest {
  suite?: FuzzSuite;
  runs?: number;
  /** Omit to explore fresh mutations; supply to replay a previous run. */
  rngSeed?: number;
}

export function runIngestFuzz(request: FuzzRunRequest = {}): Promise<FuzzRunSummary> {
  if (inFlight) return inFlight;
  inFlight = execute(request).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function execute(request: FuzzRunRequest): Promise<FuzzRunSummary> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const suite: FuzzSuite = request.suite ?? 'mutation';

  if (suite === 'text') {
    // Synchronous and fast — no seeds, no decoding, no network.
    const report = runTextFuzz();
    const bySuite: Record<string, Partial<Record<TextOutcome, number>>> = {};
    for (const c of report.cases) {
      const bucket = (bySuite[c.suite] ??= {});
      bucket[c.outcome] = (bucket[c.outcome] ?? 0) + 1;
    }
    return {
      suite,
      ok: report.findings.length === 0,
      startedAt,
      durationMs: Date.now() - t0,
      text: {
        totalCases: report.cases.length,
        counts: report.counts,
        slowestMs: report.slowestMs,
        bySuite,
        findings: report.findings.map((f) => ({
          suite: f.suite,
          field: f.field,
          label: f.label,
          outcome: f.outcome,
          expected: f.expected,
          actual: f.actual,
          probes: f.probes,
          detail: f.detail,
        })),
      },
    };
  }

  if (suite === 'baseline') {
    const runs = clampRuns(request.runs ?? DEFAULT_BASELINE_RUNS);
    const report = await runBaseline({
      runs,
      rngSeed: request.rngSeed,
      sink: makeImageSink('photo'),
    });
    return {
      suite,
      ok: report.survivors === 0 && report.findings.length === 0,
      startedAt,
      durationMs: Date.now() - t0,
      baseline: {
        runs,
        rngSeed: report.rngSeed,
        survivors: report.survivors,
        survivalRate: report.survivalRate,
        rejectedBy: report.rejectedBy,
      },
    };
  }

  const runs = clampRuns(request.runs ?? DEFAULT_FUZZ_RUNS);
  const seeds = await loadSeedCorpus();
  const report = await runFuzz({
    seeds,
    runs,
    rngSeed: request.rngSeed,
    timeoutMs: 10_000,
    sink: makeImageSink('photo'),
  });

  const byMutation: Record<string, Partial<Record<FuzzOutcome, number>>> = {};
  for (const result of report.results) {
    const bucket = (byMutation[result.mutation] ??= {});
    bucket[result.outcome] = (bucket[result.outcome] ?? 0) + 1;
  }

  return {
    suite,
    ok: report.findings.length === 0,
    startedAt,
    durationMs: Date.now() - t0,
    mutation: {
      runs,
      rngSeed: report.rngSeed,
      deterministic: request.rngSeed !== undefined,
      seedCorpus: seeds.map((seed) => seed.name),
      counts: report.counts,
      byMutation,
      findings: report.findings.map((finding) => ({
        seed: finding.seed,
        mutation: finding.mutation,
        outcome: finding.outcome,
        detail: finding.detail,
        iteration: finding.replay.iteration,
      })),
    },
  };
}

export function clampRuns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FUZZ_RUNS;
  return Math.min(MAX_FUZZ_RUNS, Math.max(MIN_FUZZ_RUNS, Math.floor(value)));
}
