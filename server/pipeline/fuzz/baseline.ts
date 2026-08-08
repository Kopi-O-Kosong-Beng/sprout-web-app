/**
 * The random-testing baseline.
 *
 * Classical fuzzing starts with "throw random bytes at it". The claim this
 * repo rests on — that mutation-based fuzzing is a necessity rather than a
 * stylistic preference — is that modern input validation rejects random input
 * long before it reaches anything worth testing. Until now that claim was
 * asserted in the documentation and never measured.
 *
 * At L0 (the ingest gate, no network) measuring it is free, so it should be
 * measured rather than assumed. The output is one number: how many of N random
 * payloads survived the gate.
 *
 * Deliberately a separate entry point rather than an extra strategy inside
 * MUTATIONS. A baseline run answers a different question from a mutation run
 * and wants a different report, and mixing them would dilute both.
 */
import { runFuzz, type FuzzReport, type FuzzSink, type FuzzSeed } from './runner';
import { BASELINE_MUTATIONS } from './mutations';

export interface BaselineOptions {
  runs: number;
  sink: FuzzSink;
  rngSeed?: number;
  timeoutMs?: number;
}

export interface BaselineReport extends FuzzReport {
  runs: number;
  /** How many random payloads the gate let through. The headline number. */
  survivors: number;
  /** survivors / runs, as a fraction. */
  survivalRate: number;
  /** Which rule stopped each payload — the funnel. Keyed by rejection reason,
   *  which is what shows two gates doing separate jobs rather than one gate
   *  doing everything. */
  rejectedBy: Record<string, number>;
}

/** Random input needs no seed corpus, but the runner's loop is written around
 *  one. A single synthetic entry keeps the loop honest without pretending
 *  these payloads derive from a photograph. */
const NO_SEED: FuzzSeed[] = [{ name: '(generated)', bytes: Buffer.alloc(0) }];

export async function runBaseline(
  options: BaselineOptions
): Promise<BaselineReport> {
  const report = await runFuzz({
    seeds: NO_SEED,
    runs: options.runs,
    rngSeed: options.rngSeed,
    sink: options.sink,
    timeoutMs: options.timeoutMs ?? 10_000,
    mutations: BASELINE_MUTATIONS,
  });

  /*
    Parse the reason out of the sink's detail line. The image sink formats
    rejections as "rejected: <reason>", so this reads the funnel without the
    runner having to know anything about image validation — which keeps the
    runner sink-agnostic, as every other caller relies on.
  */
  const rejectedBy: Record<string, number> = {};
  for (const result of report.results) {
    if (result.accepted !== false) continue;
    const match = /rejected:\s*([a-z0-9_]+)/i.exec(result.detail);
    const reason = match ? match[1] : 'other';
    rejectedBy[reason] = (rejectedBy[reason] ?? 0) + 1;
  }

  return {
    ...report,
    runs: options.runs,
    survivors: report.acceptedCount,
    survivalRate: options.runs === 0 ? 0 : report.acceptedCount / options.runs,
    rejectedBy,
  };
}

/** A one-line statement of the result, for a log or a slide. */
export function formatBaseline(report: BaselineReport): string {
  const pct = (report.survivalRate * 100).toFixed(2);
  const funnel = Object.entries(report.rejectedBy)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, n]) => `    ${reason}: ${n}`)
    .join('\n');
  return [
    '=== Random-testing baseline ===',
    `  ${report.runs} random payloads, ${report.survivors} survived (${pct}%)`,
    `  rng seed: ${report.rngSeed}`,
    '  stopped by:',
    funnel,
  ].join('\n');
}
