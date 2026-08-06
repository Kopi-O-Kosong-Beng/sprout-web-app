/**
 * Live-mode fuzzing: mutated photos through the REAL paid pipeline.
 *
 *   npm run fuzz:live -w server -- --confirm-spend --runs 10
 *
 * This costs money. Every run is a full Plant.id -> Gemini/Gemma -> Flux
 * render, because there is no cache in front of Flux — sprite-storage dedupes
 * by species key only AFTER generation, so the render is paid for and then
 * possibly discarded. Ten runs is ten full pipelines.
 *
 * Three deliberate safety properties:
 *
 *  1. NOT A VITEST FILE, and not under `pipeline/ ** /__tests__/`. The studio's
 *     Unit Tests page shells `npx vitest run` (platform/testRunner.ts), so
 *     anything matching that glob is one button-click away from running. A
 *     paid fuzz run must never be reachable that way.
 *  2. FAILS CLOSED. Without --confirm-spend it prints what it would do and
 *     exits non-zero. An accidental invocation costs nothing.
 *  3. NO KEYS IN HERE. Credentials come from platform/env, the same resolver
 *     the server uses, which reads PLANT_API_KEY / GEMMA_API_KEY /
 *     NVIDIA_API_KEY / GEMINI_KEY / FLUX_API_KEY from the environment. In CI
 *     they arrive as GitHub Actions secrets; nothing is read from a file here
 *     and nothing is ever logged.
 *
 * Unlike CI mode this defaults to NO fixed rng seed: exploring fresh mutations
 * is the point. The seed it chose is always printed, so any finding can be
 * replayed exactly with --rng-seed.
 */
import '../env';
import { runFuzz, formatReport, type SinkVerdict } from '../pipeline/fuzz/runner';
import { loadSeedCorpus, SEED_CORPUS_DIR } from '../pipeline/fuzz/seedCorpus';
import { validateUploadedImage } from '../pipeline/ingest/imageIngest';
import { identifyPlant } from '../pipeline/stages/identify';
import { craftPromptTiered } from '../pipeline/stages/promptCraft';
import { generateSprite } from '../pipeline/stages/generate';
import { createDeadline } from '../pipeline/deadline';
import { serverEnv } from '../platform/env';

interface Args {
  runs: number;
  confirmSpend: boolean;
  rngSeed?: number;
  seedsDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { runs: 10, confirmSpend: false, seedsDir: SEED_CORPUS_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm-spend') args.confirmSpend = true;
    else if (arg === '--runs') args.runs = Number(argv[++i]);
    else if (arg === '--rng-seed') args.rngSeed = Number(argv[++i]);
    else if (arg === '--seeds') args.seedsDir = argv[++i];
  }
  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error('--runs must be a positive integer.');
  }
  return args;
}

/**
 * The confidence floor for calling an identification trustworthy.
 *
 * Read from the SAME place the pipeline reads it
 * (serverEnv.minConfidenceThreshold, MIN_CONFIDENCE_THRESHOLD, default 0.7),
 * rather than restated here. A threshold the fuzzer disagreed with would
 * report findings the production route does not have — or, worse, miss the
 * ones it does.
 */
function confidenceFloor(): number {
  return serverEnv.minConfidenceThreshold;
}

/**
 * The live sink: ingest gate -> Plant.id -> prompt craft -> Flux.
 *
 * `accepted: false` means the pipeline correctly refused the mutant. Throwing
 * means it broke. Returning accepted:true for garbage is what the runner
 * reports as silent_bad_output — the class the original harness could not see.
 *
 * The silent_bad_output checks live here rather than in the runner because
 * only this sink knows what "bad" means for this pipeline:
 *
 *  - Plant.id returns a species BELOW the confidence floor and the run
 *    continues anyway. The route gates on this at pipeline.routes.ts, so a
 *    finding here means the two have drifted apart.
 *  - Flux returns a sprite for input that is provably not a plant (uniform
 *    noise, a flat black field). A confident answer from garbage is worse than
 *    an error, because nothing downstream knows to distrust it.
 */
function makeLiveSink(): (input: Buffer, mutation: string) => Promise<SinkVerdict> {
  const floor = confidenceFloor();

  return async (input, mutation) => {
    const ingest = await validateUploadedImage(input);
    if (!ingest.ok) {
      return { accepted: false, detail: `ingest rejected: ${ingest.reason}` };
    }

    const deadline = createDeadline();
    const identification: any = await identifyPlant(
      ingest.base64,
      serverEnv.plantApiKey ?? '',
      deadline
    );

    if (identification?.error) {
      return { accepted: false, detail: `plant.id error: ${identification.error}` };
    }

    const probability =
      typeof identification?.probability === 'number'
        ? identification.probability
        : null;
    const name = identification?.name ?? 'unknown';

    // Drift check against the production gate.
    if (probability !== null && probability < floor) {
      return {
        accepted: true,
        detail:
          `LOW CONFIDENCE PROCEEDED: ${name} at ${(probability * 100).toFixed(0)}% ` +
          `is under the ${(floor * 100).toFixed(0)}% floor, and the pipeline did not stop.`,
      };
    }

    // Content that cannot be a plant. A confident identification here is the
    // interesting result, not the sprite.
    const isGarbageInput = mutation === 'pixel_noise';
    if (isGarbageInput && probability !== null && probability >= floor) {
      return {
        accepted: true,
        detail:
          `CONFIDENT ON GARBAGE: uniform noise identified as ${name} ` +
          `at ${(probability * 100).toFixed(0)}%.`,
      };
    }

    // Same argument order and the same env-resolved keys the route uses, so a
    // finding here is a finding about the real pipeline rather than about a
    // differently-wired copy of it.
    const promptResult = await craftPromptTiered(
      ingest.base64,
      name,
      serverEnv.gemmaApiKey ?? '',
      serverEnv.geminiKey ?? '',
      undefined,
      deadline
    );

    const sprite = await generateSprite(
      promptResult.prompt,
      {
        flux: serverEnv.fluxApiKey,
        gemini: serverEnv.geminiKey,
        geminiModel: serverEnv.geminiImageModel,
        provider: serverEnv.imageProvider === 'gemini' ? 'gemini' : 'flux',
      },
      deadline
    );

    /*
      `fromModel` is the distinction that matters. generateSprite falls back to
      a procedural placeholder when no image model ran, and a placeholder for
      garbage is correct behaviour — it is a real model confidently rendering a
      plant from uniform noise that is the finding.
    */
    if (isGarbageInput && sprite.fromModel) {
      return {
        accepted: true,
        detail:
          `SPRITE FROM GARBAGE: ${sprite.model} rendered a sprite for uniform noise, ` +
          `identified as ${name}.`,
      };
    }

    return {
      accepted: true,
      detail: `completed: ${name} at ${probability === null ? 'n/a' : probability}`,
    };
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const seeds = await loadSeedCorpus(args.seedsDir);

  if (!args.confirmSpend) {
    console.error(
      [
        'Refusing to run: live mode calls paid APIs.',
        '',
        `  It would run ${args.runs} mutations from ${seeds.length} seed photos,`,
        '  each a full Plant.id -> Gemini/Gemma -> Flux render. There is no',
        '  cache in front of Flux, so every run is billed.',
        '',
        '  Re-run with --confirm-spend if that is what you want.',
      ].join('\n')
    );
    process.exit(2);
  }

  // Named, never valued — a missing key must be diagnosable without printing
  // a secret into a CI log.
  const missing = [
    ['PLANT_API_KEY', serverEnv.plantApiKey],
    ['FLUX/NVIDIA key', serverEnv.fluxApiKey],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    console.error(
      `Missing credentials: ${missing.map(([k]) => k).join(', ')}. ` +
        'Set them in the environment (GitHub Actions secrets in CI).'
    );
    process.exit(2);
  }

  console.log(
    `Live fuzz: ${args.runs} runs over ${seeds.length} seed photos. This spends API credits.`
  );

  const report = await runFuzz({
    seeds,
    runs: args.runs,
    rngSeed: args.rngSeed,
    sink: makeLiveSink(),
    // The real chain is slow: Plant.id plus a vision model plus a render.
    timeoutMs: 120_000,
    onFinding: (finding) =>
      console.error(`[${finding.outcome}] ${finding.mutation}: ${finding.detail}`),
  });

  console.log(formatReport(report));
  if (report.findings.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
