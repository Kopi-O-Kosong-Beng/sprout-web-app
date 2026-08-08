/**
 * The fuzz loop, independent of what it is fuzzing.
 *
 * `sink` is the thing under test. In CI that is the real
 * `validateUploadedImage` — the same function `/api/pipeline/run-stream` calls
 * on every player scan, not a copy — so a green run is a statement about the
 * code players actually hit. In live mode it is the paid Plant.id → Gemini →
 * Flux chain.
 *
 * Outcomes, and why each exists:
 *
 *   ok                — the sink answered, within time, as expected.
 *   crash             — the sink threw. For the CI sink this is always a bug:
 *                       its contract is a result object, never an exception.
 *   hang              — the sink exceeded its time budget. A validator that
 *                       takes a minute on crafted input is a denial of service
 *                       even though it never crashes.
 *   silent_bad_output — the sink returned successfully but the answer is
 *                       wrong: garbage accepted, or a legitimate image
 *                       refused. This is the class the original harness could
 *                       not see, and the one most likely to be real.
 *   skipped           — the mutation could not be applied to this seed. Not a
 *                       finding; tracked so a run that quietly mutated nothing
 *                       is visible rather than reported as 300 passes.
 */
import { MUTATIONS, createRng, pick, type Mutant, type Mutation } from './mutations';

export type FuzzOutcome =
  | 'ok'
  | 'crash'
  | 'hang'
  | 'silent_bad_output'
  | 'skipped';

export interface FuzzResult {
  seed: string;
  mutation: string;
  outcome: FuzzOutcome;
  /** Whether the sink let this input through. Undefined when it never
   *  answered (crash, hang, skipped). Distinct from `outcome`: an acceptance
   *  can be perfectly correct, and the random-testing baseline needs the raw
   *  count of what survived rather than the count of what was wrong. */
  accepted?: boolean;
  detail: string;
  elapsedMs: number;
  /** Everything needed to replay this exact case by hand. */
  replay: { rngSeed: number; iteration: number };
}

export interface FuzzSeed {
  name: string;
  bytes: Buffer;
}

/** What the sink reports back. `expectedAccept` lets the runner judge the
 *  answer, not merely the absence of a crash. */
export interface SinkVerdict {
  accepted: boolean;
  detail: string;
}

export type FuzzSink = (
  input: Buffer,
  mutation: string,
  deliverAs: 'base64' | 'literal'
) => Promise<SinkVerdict>;

export interface FuzzOptions {
  seeds: FuzzSeed[];
  runs: number;
  sink: FuzzSink;
  /** Omit for live mode, where exploring new mutations each run is the point. */
  rngSeed?: number;
  timeoutMs?: number;
  mutations?: readonly Mutation[];
  onFinding?: (result: FuzzResult) => void;
}

export interface FuzzReport {
  results: FuzzResult[];
  rngSeed: number;
  counts: Record<FuzzOutcome, number>;
  /** How many inputs the sink let through, right or wrong. The
   *  random-testing baseline exists to report exactly this number. */
  acceptedCount: number;
  findings: FuzzResult[];
}

/** Races the sink against a timer so a hang is reported rather than inherited.
 *  The work is not cancellable — this bounds the REPORT, not the process, and
 *  the runner is short-lived by design. */
async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number
): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    return await Promise.race([
      work.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runFuzz(options: FuzzOptions): Promise<FuzzReport> {
  const {
    seeds,
    runs,
    sink,
    timeoutMs = 10_000,
    mutations = MUTATIONS,
    onFinding,
  } = options;

  if (seeds.length === 0) throw new Error('No seed images supplied.');

  /*
    With no rngSeed the run picks one and REPORTS it. Live mode wants fresh
    mutations every night, but an unreproducible finding is close to useless —
    so the seed that produced it is always printed, and passing it back with
    --rng-seed replays the run exactly.
  */
  const rngSeed = options.rngSeed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = createRng(rngSeed);

  const results: FuzzResult[] = [];

  for (let iteration = 0; iteration < runs; iteration += 1) {
    const seed = pick(rng, seeds);
    const mutation = pick(rng, mutations);
    const replay = { rngSeed, iteration };

    let mutated: Mutant | null;
    try {
      mutated = await mutation.apply(seed.bytes, rng);
    } catch (error) {
      // A mutator that throws is a bug in the harness, not a finding in the
      // sink. Recorded as skipped so it cannot masquerade as a pass.
      results.push({
        seed: seed.name,
        mutation: mutation.name,
        outcome: 'skipped',
        detail: `mutator threw: ${error instanceof Error ? error.message : error}`,
        elapsedMs: 0,
        replay,
      });
      continue;
    }

    if (mutated === null) {
      results.push({
        seed: seed.name,
        mutation: mutation.name,
        outcome: 'skipped',
        detail: 'mutation not applicable to this seed',
        elapsedMs: 0,
        replay,
      });
      continue;
    }

    const startedAt = Date.now();
    let result: FuzzResult;
    try {
      const raced = await withTimeout(
        sink(mutated.bytes, mutation.name, mutated.deliverAs ?? 'base64'),
        timeoutMs
      );
      const elapsedMs = Date.now() - startedAt;

      if (raced.timedOut) {
        result = {
          seed: seed.name,
          mutation: mutation.name,
          outcome: 'hang',
          detail: `exceeded ${timeoutMs}ms`,
          elapsedMs,
          replay,
        };
      } else {
        /*
          Judged against what this mutant actually IS, which the mutation
          reported when it built it — not against which strategy produced it.
          An earlier version keyed the expectation off the strategy name and
          logged 38 false findings on the first run: a bitflip deep in JPEG
          pixel data still yields a valid image, and format_confusion choosing
          WebP produces a format that is genuinely on the allow-list. Both were
          correct acceptances being reported as bugs.
        */
        const { expect: expected } = mutated;
        const wrong =
          (expected === 'accept' && !raced.value.accepted) ||
          (expected === 'reject' && raced.value.accepted);
        result = {
          seed: seed.name,
          mutation: mutation.name,
          outcome: wrong ? 'silent_bad_output' : 'ok',
          accepted: raced.value.accepted,
          detail: wrong
            ? expected === 'accept'
              ? `a valid image was refused: ${raced.value.detail}`
              : `hostile input was accepted: ${raced.value.detail}`
            : raced.value.detail,
          elapsedMs,
          replay,
        };
      }
    } catch (error) {
      result = {
        seed: seed.name,
        mutation: mutation.name,
        outcome: 'crash',
        detail: error instanceof Error ? (error.stack ?? error.message) : String(error),
        elapsedMs: Date.now() - startedAt,
        replay,
      };
    }

    results.push(result);
    if (result.outcome !== 'ok' && result.outcome !== 'skipped') {
      onFinding?.(result);
    }
  }

  const counts: Record<FuzzOutcome, number> = {
    ok: 0,
    crash: 0,
    hang: 0,
    silent_bad_output: 0,
    skipped: 0,
  };
  for (const result of results) counts[result.outcome] += 1;

  return {
    results,
    rngSeed,
    counts,
    acceptedCount: results.filter((r) => r.accepted === true).length,
    findings: results.filter(
      (r) => r.outcome === 'crash' || r.outcome === 'hang' || r.outcome === 'silent_bad_output'
    ),
  };
}

/** A short, paste-able summary. Always prints the rng seed, because that is
 *  what turns "CI went red once" into a case you can rerun on your laptop. */
export function formatReport(report: FuzzReport): string {
  const lines = [
    '=== Fuzz run summary ===',
    `  rng seed: ${report.rngSeed}  (replay with --rng-seed ${report.rngSeed})`,
    ...Object.entries(report.counts)
      .filter(([, n]) => n > 0)
      .map(([outcome, n]) => `  ${outcome}: ${n}`),
  ];
  if (report.findings.length > 0) {
    lines.push('', '--- Findings worth triaging ---');
    for (const f of report.findings) {
      lines.push(
        `[${f.outcome}] seed=${f.seed} mutation=${f.mutation} iteration=${f.replay.iteration}`,
        `    ${f.detail.slice(0, 300)}`
      );
    }
  }
  return lines.join('\n');
}
