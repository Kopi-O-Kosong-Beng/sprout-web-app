import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  loadSeedCorpus,
  resolveSeedCorpusDir,
  seedCorpusCandidates,
} from '../fuzz/seedCorpus';

/**
 * Corpus resolution, which broke in production exactly once and would have
 * broken silently again.
 *
 * The original resolved a single fixed path, `__dirname/../../../client/...`,
 * correct only when running from TypeScript source. `tsc` inserts a `dist`
 * level, so every compiled run — including the Docker image — looked for
 * `<repo>/server/client/...` and failed with ENOENT. The container could not
 * have worked regardless: the backend image ships no `client/` at all.
 *
 * These tests are about the SEARCH, not about the photographs.
 */
const cleanups: string[] = [];

function tempCorpus(withImage = true): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sprout-seeds-'));
  cleanups.push(dir);
  if (withImage) writeFileSync(path.join(dir, 'plant.jpg'), 'not really a jpeg');
  return dir;
}

afterEach(() => {
  delete process.env.SPROUT_FUZZ_SEEDS;
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

describe('seed corpus resolution', () => {
  it('finds the golden set from wherever this file was compiled to', () => {
    // Under vitest __dirname is the source tree; the point is that resolution
    // succeeds without anyone having configured a path.
    const resolved = resolveSeedCorpusDir();
    expect(resolved).not.toBeNull();
    expect(resolved).toMatch(/goldenset[/\\]photos$|fuzz-seeds$/);
  });

  it('searches several roots rather than one fixed path', () => {
    const candidates = seedCorpusCandidates();
    expect(candidates.length).toBeGreaterThan(1);
    // Both layouts are covered: the shipped copy and the monorepo golden set.
    expect(candidates.some((c) => c.endsWith('fuzz-seeds'))).toBe(true);
    expect(candidates.some((c) => c.includes('goldenset'))).toBe(true);
  });

  it('walks up far enough to absorb the extra dist/ level', () => {
    /*
      The actual regression. server/dist/pipeline/fuzz needs three levels up to
      reach the repo root; server/pipeline/fuzz needs two. Counting levels is
      what broke — the candidate list must span both depths.
    */
    const depths = new Set(
      seedCorpusCandidates()
        .filter((c) => c.includes('goldenset'))
        .map((c) => c.split(path.sep).length)
    );
    expect(depths.size).toBeGreaterThanOrEqual(3);
  });

  it('lets SPROUT_FUZZ_SEEDS win outright', async () => {
    const dir = tempCorpus();
    process.env.SPROUT_FUZZ_SEEDS = dir;

    expect(resolveSeedCorpusDir()).toBe(dir);
    const seeds = await loadSeedCorpus();
    expect(seeds.map((s) => s.name)).toEqual(['plant.jpg']);
  });

  it('ignores a directory that exists but holds no images', () => {
    // An empty directory is not a corpus. Treating it as one would report a
    // run of zero mutations as a pass.
    process.env.SPROUT_FUZZ_SEEDS = tempCorpus(false);
    const resolved = resolveSeedCorpusDir();
    expect(resolved).not.toBe(process.env.SPROUT_FUZZ_SEEDS);
  });

  it('says where it looked when it finds nothing', async () => {
    const empty = tempCorpus(false);
    await expect(loadSeedCorpus(empty)).rejects.toThrow(/No seed images found/);
  });

  it('returns seeds in a stable order, so a pinned rng picks the same photos', async () => {
    const first = await loadSeedCorpus();
    const second = await loadSeedCorpus();
    expect(second.map((s) => s.name)).toEqual(first.map((s) => s.name));
    expect(first.map((s) => s.name)).toEqual([...first.map((s) => s.name)].sort());
  });
});
