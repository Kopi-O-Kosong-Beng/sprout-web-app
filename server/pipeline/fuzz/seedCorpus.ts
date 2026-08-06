/**
 * The seed corpus: real plant photographs to mutate.
 *
 * These are the studio's golden-set images
 * (client/src/studio/pipeline/goldenset/photos), not a new directory of
 * files someone has to supply. Ten real camera photographs already in the
 * repo, already curated, and already including the awkward cases a fuzzer
 * wants as a starting point — blurred_plants.jpg and lego_plant.jpg are
 * marked `stress: true` in the golden-set manifest precisely because they are
 * hard inputs.
 *
 * Reading across the workspace boundary is deliberate. Copying them into
 * server/ would give the repo two divergent corpora, and the fuzzer wants the
 * same photographs the pipeline is evaluated against.
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import type { FuzzSeed } from './runner';

/** Resolved from this file so it holds regardless of the caller's cwd — the
 *  suite runs from server/, the CLI may not. */
export const SEED_CORPUS_DIR = path.resolve(
  __dirname,
  '../../../client/src/studio/pipeline/goldenset/photos'
);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export async function loadSeedCorpus(
  directory: string = SEED_CORPUS_DIR
): Promise<FuzzSeed[]> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    throw new Error(
      `Could not read the seed corpus at ${directory}. ` +
        `Point --seeds at a directory of real plant photos. ` +
        `(${error instanceof Error ? error.message : error})`
    );
  }

  const seeds: FuzzSeed[] = [];
  // Sorted so a fixed rng seed selects the same photographs on every machine:
  // readdir order is filesystem-dependent, which would quietly break the
  // reproducibility the whole CI mode is built on.
  for (const entry of entries.sort()) {
    if (!IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
    seeds.push({ name: entry, bytes: await readFile(path.join(directory, entry)) });
  }

  if (seeds.length === 0) {
    throw new Error(`No seed images found in ${directory}.`);
  }
  return seeds;
}
