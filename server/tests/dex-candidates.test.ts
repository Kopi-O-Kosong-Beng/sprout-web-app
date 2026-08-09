/** Firestore-emulator tests for the dex-candidate repository — the storage
 *  half of the studio's Dex Gate. Runs under `npm run test:jest:emulator`. */
import { getDb } from '../firebase';
import dexCandidateRepository, { candidateId, isAlreadyExists } from '../repositories/dexCandidates';
import type { DexCandidate } from '../models/dexCandidate';
import { clearFirestore } from './firestore-test-utils';

function candidate(overrides: Partial<DexCandidate> = {}): DexCandidate {
  const version = overrides.version ?? 1;
  const speciesKey = overrides.speciesKey ?? 'fern';
  return {
    id: candidateId(speciesKey, version),
    speciesKey,
    speciesName: 'Fern',
    version,
    spriteUrl: `https://cdn.test/${speciesKey}-v${version}.png`,
    status: 'PENDING',
    scannedBy: 'user-a',
    createdAt: '2026-08-09T00:00:00.000Z',
    evaluation: null,
    ...overrides,
  };
}

beforeEach(clearFirestore);

describe('dexCandidateRepository', () => {
  it('creates and reads a candidate row', async () => {
    await dexCandidateRepository.create(candidate({ version: 1, status: 'PUBLISHED' }));
    const stored = await dexCandidateRepository.get(candidateId('fern', 1));

    expect(stored?.speciesKey).toBe('fern');
    expect(stored?.status).toBe('PUBLISHED');
    expect(stored?.version).toBe(1);
  });

  it('refuses to overwrite an existing version — the allocation loop leans on this', async () => {
    await dexCandidateRepository.create(candidate({ version: 2 }));

    let error: unknown = null;
    try {
      await dexCandidateRepository.create(candidate({ version: 2, spriteUrl: 'other.png' }));
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
    expect(isAlreadyExists(error)).toBe(true);
    // The original row survives untouched.
    const stored = await dexCandidateRepository.get(candidateId('fern', 2));
    expect(stored?.spriteUrl).toBe('https://cdn.test/fern-v2.png');
  });

  it('reports the highest version per species, 0 when none', async () => {
    expect(await dexCandidateRepository.maxVersion('fern')).toBe(0);

    await dexCandidateRepository.create(candidate({ version: 1 }));
    await dexCandidateRepository.create(candidate({ version: 3 }));
    await dexCandidateRepository.create(candidate({ speciesKey: 'oak', version: 7 }));

    expect(await dexCandidateRepository.maxVersion('fern')).toBe(3);
    expect(await dexCandidateRepository.maxVersion('oak')).toBe(7);
  });

  it('publish swaps the global reference atomically: dex.spriteUrl, promotion, demotion', async () => {
    await getDb().collection('dex').doc('fern').set({
      speciesKey: 'fern',
      speciesName: 'Fern',
      spriteUrl: 'https://cdn.test/fern-v1.png',
      discoveryCount: 2,
    });
    await dexCandidateRepository.create(candidate({ version: 1, status: 'PUBLISHED' }));
    await dexCandidateRepository.create(candidate({ version: 2 }));

    const published = await dexCandidateRepository.publish(candidateId('fern', 2));

    expect(published.status).toBe('PUBLISHED');
    const v1 = await dexCandidateRepository.get(candidateId('fern', 1));
    expect(v1?.status).toBe('PENDING'); // demoted, not rejected — re-publishable
    const dexDoc = await getDb().collection('dex').doc('fern').get();
    expect(dexDoc.data()?.spriteUrl).toBe('https://cdn.test/fern-v2.png');
    // Untouched fields survive the merge.
    expect(dexDoc.data()?.discoveryCount).toBe(2);
  });

  it('reject marks a pending candidate and refuses to reject the published one', async () => {
    await dexCandidateRepository.create(candidate({ version: 1, status: 'PUBLISHED' }));
    await dexCandidateRepository.create(candidate({ version: 2 }));

    const rejected = await dexCandidateRepository.reject(candidateId('fern', 2));
    expect(rejected.status).toBe('REJECTED');

    // Rejecting the published sprite would leave the species with a reference
    // nothing vouches for.
    await expect(dexCandidateRepository.reject(candidateId('fern', 1))).rejects.toThrow(
      /published/i
    );
  });

  it('publish of an unknown id names the problem', async () => {
    await expect(dexCandidateRepository.publish('fern__v9')).rejects.toThrow(
      /No such candidate/
    );
  });

  it('lists newest first for the gate', async () => {
    await dexCandidateRepository.create(
      candidate({ version: 1, createdAt: '2026-08-01T00:00:00.000Z' })
    );
    await dexCandidateRepository.create(
      candidate({ version: 2, createdAt: '2026-08-09T00:00:00.000Z' })
    );

    const all = await dexCandidateRepository.listAll();
    expect(all.map((c) => c.version)).toEqual([2, 1]);
  });
});
