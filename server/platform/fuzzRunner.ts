/**
 * The fuzz run behind the studio's Fuzz Testing page.
 *
 * Runs IN-PROCESS rather than shelling vitest, which the Unit Tests page does.
 * That is the whole reason this exists: the fuzzer already produces a
 * structured report — rng seed, per-outcome counts, per-mutation breakdown,
 * findings with replay coordinates — and spawning vitest would flatten all of
 * it into "1 passed" plus a wall of terminal text. An operator opening this
 * page wants the distribution, not a green tick.
 *
 * SAFETY: this module imports ONLY validateUploadedImage. It cannot reach the
 * live pipeline, and that is deliberate rather than incidental — a page with a
 * Run button must not be able to spend API credits. The paid path lives in
 * scripts/fuzz-pipeline-live.ts, is not a vitest file, is not under the studio
 * test glob, and refuses to start without --confirm-spend. Adding an import of
 * it here would defeat all four of those.
 */
import { runFuzz, type FuzzOutcome } from '../pipeline/fuzz/runner';
import { loadSeedCorpus } from '../pipeline/fuzz/seedCorpus';
import { validateUploadedImage } from '../pipeline/ingest/imageIngest';

/** Bounds on what the page may ask for. The upper bound is a guard against a
 *  hand-edited request tying the server up: 300 runs takes roughly 25s. */
export const MIN_FUZZ_RUNS = 10;
export const MAX_FUZZ_RUNS = 1_000;
export const DEFAULT_FUZZ_RUNS = 300;

export interface FuzzFinding {
  seed: string;
  mutation: string;
  outcome: FuzzOutcome;
  detail: string;
  iteration: number;
}

export interface FuzzRunSummary {
  ok: boolean;
  startedAt: string;
  durationMs: number;
  runs: number;
  /** Always returned, so any finding can be replayed exactly. */
  rngSeed: number;
  /** True when the caller pinned the seed, i.e. this run is reproducible. */
  deterministic: boolean;
  seedCorpus: string[];
  counts: Record<FuzzOutcome, number>;
  /** Outcome tallies per mutation strategy — shows at a glance whether a
   *  strategy is doing nothing (all skipped) or carrying the whole run. */
  byMutation: Record<string, Partial<Record<FuzzOutcome, number>>>;
  findings: FuzzFinding[];
}

/** One run at a time. The work is CPU-bound image decoding; two concurrent
 *  runs would just make both slow and the report harder to attribute. */
let inFlight: Promise<FuzzRunSummary> | null = null;

export function isFuzzRunInFlight(): boolean {
  return inFlight !== null;
}

export interface FuzzRunRequest {
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

  const runs = clampRuns(request.runs ?? DEFAULT_FUZZ_RUNS);
  const seeds = await loadSeedCorpus();

  const report = await runFuzz({
    seeds,
    runs,
    rngSeed: request.rngSeed,
    timeoutMs: 10_000,
    sink: async (bytes) => {
      const result = await validateUploadedImage(bytes);
      return {
        accepted: result.ok,
        detail: result.ok
          ? `accepted ${result.format} ${result.width}x${result.height}`
          : `rejected: ${result.reason}`,
      };
    },
  });

  const byMutation: Record<string, Partial<Record<FuzzOutcome, number>>> = {};
  for (const result of report.results) {
    const bucket = (byMutation[result.mutation] ??= {});
    bucket[result.outcome] = (bucket[result.outcome] ?? 0) + 1;
  }

  return {
    ok: report.findings.length === 0,
    startedAt,
    durationMs: Date.now() - t0,
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
  };
}

export function clampRuns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FUZZ_RUNS;
  return Math.min(MAX_FUZZ_RUNS, Math.max(MIN_FUZZ_RUNS, Math.floor(value)));
}
