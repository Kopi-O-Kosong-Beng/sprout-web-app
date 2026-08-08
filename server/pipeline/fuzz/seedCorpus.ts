/**
 * The seed corpus: real plant photographs to mutate.
 *
 * These are the studio's golden-set images
 * (client/src/studio/pipeline/goldenset/photos) — ten real camera photographs
 * already in the repo, already curated, and already including the awkward
 * cases a fuzzer wants as a starting point (blurred_plants.jpg and
 * lego_plant.jpg are marked `stress: true` in the golden-set manifest).
 *
 * FINDING THEM IS NOT AS SIMPLE AS IT LOOKS, and the first version of this
 * file got it wrong. It resolved one fixed path, `__dirname/../../../client/…`,
 * which is correct only when running from TypeScript source:
 *
 *   tsx      server/pipeline/fuzz        ../../../ -> repo root        works
 *   compiled server/dist/pipeline/fuzz   ../../../ -> server/          breaks
 *
 * `tsc` adds a `dist` level, so every built run — including the Docker image —
 * looked for `<repo>/server/client/src/...` and failed with ENOENT. Worse, the
 * backend image does not contain `client/` at all: server/Dockerfile copies
 * only `client/package.json`, for the workspace install.
 *
 * So resolution now searches, in order:
 *
 *   1. SPROUT_FUZZ_SEEDS       explicit override, wins outright
 *   2. a server-local copy     what the Docker image ships (see Dockerfile)
 *   3. the monorepo golden set found by walking up from this file, so the
 *                              extra `dist` level cannot matter
 *
 * The walk means dev, compiled-local, CI and container all work without any of
 * them needing to know which of the others is true.
 */
import { readdir, readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import type { FuzzSeed } from './runner';

/** Where the golden set lives relative to the repository root. */
const GOLDENSET_RELATIVE = path.join(
  'client',
  'src',
  'studio',
  'pipeline',
  'goldenset',
  'photos'
);

/** Where the Docker image places its shipped copy, relative to the server root.
 *  Kept out of git — the Dockerfile copies it in at build time. */
const SHIPPED_RELATIVE = path.join('fuzz-seeds');

/**
 * Every directory worth trying, most specific first.
 *
 * Exported so the error message can list what was actually looked at. A fuzz
 * harness that cannot find its corpus should say where it searched, not just
 * that it failed — the original ENOENT named one path and gave no clue that
 * the path was computed rather than configured.
 */
export function seedCorpusCandidates(): string[] {
  const candidates: string[] = [];

  const override = process.env.SPROUT_FUZZ_SEEDS?.trim();
  if (override) candidates.push(path.resolve(override));

  /*
    Walk up from this file looking for either layout. Six levels is generous:
    the deepest real case is server/dist/pipeline/fuzz, which needs three.
    Walking rather than counting is what makes this immune to the dist/ level
    that broke the original.
  */
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    candidates.push(path.join(dir, SHIPPED_RELATIVE));
    candidates.push(path.join(dir, GOLDENSET_RELATIVE));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Deduplicate while preserving order.
  return [...new Set(candidates)];
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** True when a directory exists and holds at least one usable image. An empty
 *  directory is not a corpus, and treating it as one would report a run of
 *  zero mutations as a pass. */
function hasImages(directory: string): boolean {
  if (!existsSync(directory)) return false;
  try {
    // Sync on purpose: this runs once, during candidate selection.
    const entries = readdirSync(directory);
    return entries.some((entry) =>
      IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase())
    );
  } catch {
    return false;
  }
}

/** The first candidate that actually holds images, or null. */
export function resolveSeedCorpusDir(): string | null {
  return seedCorpusCandidates().find(hasImages) ?? null;
}

/** Kept as a named export because tooling and docs refer to it. Resolves at
 *  call time rather than module load, so a test can point the override
 *  somewhere else without reimporting. */
export function seedCorpusDir(): string {
  const resolved = resolveSeedCorpusDir();
  if (resolved) return resolved;
  throw new Error(describeMissingCorpus());
}

function describeMissingCorpus(): string {
  return [
    'Could not find a seed corpus of plant photos.',
    'Looked in:',
    ...seedCorpusCandidates().map((candidate) => `  - ${candidate}`),
    'Set SPROUT_FUZZ_SEEDS to a directory of real plant photos, or pass --seeds.',
  ].join('\n');
}

export async function loadSeedCorpus(directory?: string): Promise<FuzzSeed[]> {
  const target = directory ?? resolveSeedCorpusDir();
  if (!target) throw new Error(describeMissingCorpus());

  let entries: string[];
  try {
    entries = await readdir(target);
  } catch (error) {
    throw new Error(
      `Could not read the seed corpus at ${target}. ` +
        `(${error instanceof Error ? error.message : error})`
    );
  }

  const seeds: FuzzSeed[] = [];
  // Sorted so a fixed rng seed selects the same photographs on every machine:
  // readdir order is filesystem-dependent, which would quietly break the
  // reproducibility the whole CI mode is built on.
  for (const entry of entries.sort()) {
    if (!IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
    seeds.push({ name: entry, bytes: await readFile(path.join(target, entry)) });
  }

  if (seeds.length === 0) {
    throw new Error(`No seed images found in ${target}.`);
  }
  return seeds;
}
