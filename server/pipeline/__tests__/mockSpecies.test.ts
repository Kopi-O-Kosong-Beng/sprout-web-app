import { describe, it, expect, afterEach } from 'vitest';
import {
  MOCK_SPECIES_POOL,
  digestPhoto,
  pickMockSpecies,
} from '../stages/mockSpecies';
import { identifyPlant } from '../stages/identify';

/** A base64-ish payload of a given size, distinct per seed. */
function photo(seed: string, size = 6000): string {
  let out = '';
  while (out.length < size) out += `${seed}${out.length}abcdefghij`;
  return out.slice(0, size);
}

describe('mock species selection', () => {
  it('always returns the same species for the same photograph', () => {
    const p = photo('fern');
    const first = pickMockSpecies(p);
    for (let i = 0; i < 20; i += 1) {
      expect(pickMockSpecies(p).name).toBe(first.name);
    }
  });

  it('spreads different photographs across the pool', () => {
    // The point of the varied mode: a visitor photographing several plants must
    // not end up with one creature and a pile of silent rescans. Exactness is
    // not claimed — collisions are fine — but a hash that returned one species
    // for everything would pass a determinism test and fail the product.
    const names = new Set(
      Array.from({ length: 200 }, (_, i) => pickMockSpecies(photo(`plant-${i}`)).name)
    );
    expect(names.size).toBeGreaterThan(MOCK_SPECIES_POOL.length / 2);
  });

  it('distinguishes photographs that share a long prefix', () => {
    // base64 of images from one camera often shares a header, so a digest that
    // read only the start would collapse a whole afternoon's scans together.
    const shared = photo('same-camera-header', 8000);
    const a = `${shared}AAAAAAAAAAAAAAAA`;
    const b = `${shared}BBBBBBBBBBBBBBBB`;
    expect(digestPhoto(a)).not.toBe(digestPhoto(b));
  });

  it('only ever returns a species from the pool', () => {
    const pool = new Set(MOCK_SPECIES_POOL.map((s) => s.name));
    for (let i = 0; i < 100; i += 1) {
      expect(pool.has(pickMockSpecies(photo(`x${i}`)).name)).toBe(true);
    }
  });
});

describe('identifyPlant under the mock key', () => {
  const original = process.env.MOCK_IDENTIFY_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.MOCK_IDENTIFY_MODE;
    else process.env.MOCK_IDENTIFY_MODE = original;
  });

  it('answers Polygala calcarea by default, as every existing suite expects', async () => {
    delete process.env.MOCK_IDENTIFY_MODE;
    const result = await identifyPlant(photo('anything'), '');
    expect('name' in result && result.name).toBe('Polygala calcarea');
  });

  it('varies by photograph when asked to', async () => {
    process.env.MOCK_IDENTIFY_MODE = 'varied';
    const names = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const result = await identifyPlant(photo(`shot-${i}`), '');
      if ('name' in result) names.add(result.name);
    }
    expect(names.size).toBeGreaterThan(1);
    expect(names.has('Polygala calcarea')).toBe(false);
  });

  it('keeps the lowercase taxonomy keys downstream readers depend on', async () => {
    process.env.MOCK_IDENTIFY_MODE = 'varied';
    const result = await identifyPlant(photo('leaf'), '');
    expect('name' in result).toBe(true);
    if ('name' in result) {
      expect(Object.keys(result.taxonomy).sort()).toEqual([
        'family',
        'genus',
        'kingdom',
        'order',
      ]);
    }
  });
});
