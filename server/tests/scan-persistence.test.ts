import { persistScan, type ScanPersistenceDependencies } from '../services/scan-persistence';
import type { AvatarRecord } from '../models/avatar';

const PNG = Buffer.from('png');

const RECORD = { id: 'avatar-1' } as AvatarRecord;

function deps(overrides: Partial<ScanPersistenceDependencies> = {}): ScanPersistenceDependencies {
  return {
    storage: { save: jest.fn().mockResolvedValue('https://cdn.test/fern.png') },
    dex: {
      recordDiscovery: jest.fn().mockResolvedValue({
        speciesKey: 'fern',
        speciesName: 'Fern',
        firstDiscoveredBy: 'user-a',
        firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
        discoveryCount: 1,
      }),
      get: jest.fn(),
    },
    avatars: { upsertFromScan: jest.fn().mockResolvedValue({ record: RECORD, created: true }) },
    ...overrides,
  };
}

describe('persistScan', () => {
  it('stores the sprite, records the discovery, and writes the archive row', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-a', 'Fern', 'Polypodiaceae', PNG);

    expect(dependencies.storage.save).toHaveBeenCalledWith('fern', PNG);
    expect(dependencies.dex.recordDiscovery).toHaveBeenCalledWith('fern', 'user-a', 'Fern');
    expect(result.saved).toBe(true);
    expect(result.avatarId).toBe('avatar-1');
    expect(result.discovery?.firstDiscoveredBy).toBe('user-a');
  });

  it('passes the stored sprite URL through to the archive record', async () => {
    const dependencies = deps();
    await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(dependencies.avatars.upsertFromScan).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ spriteUrl: 'https://cdn.test/fern.png' })
    );
  });

  it('reports a storage failure without throwing', async () => {
    const dependencies = deps({
      storage: { save: jest.fn().mockRejectedValue(new Error('bucket unreachable')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(false);
    expect(result.avatarId).toBeNull();
    expect(result.saveError).toContain('bucket unreachable');
  });

  it('reports a dex discovery failure without throwing', async () => {
    const dependencies = deps({
      dex: {
        recordDiscovery: jest.fn().mockRejectedValue(new Error('dex write conflict')),
        get: jest.fn(),
      },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(false);
    expect(result.avatarId).toBeNull();
    expect(result.saveError).toContain('dex write conflict');
  });

  it('reports a Firestore failure without throwing', async () => {
    const dependencies = deps({
      avatars: { upsertFromScan: jest.fn().mockRejectedValue(new Error('firestore down')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(false);
    expect(result.saveError).toContain('firestore down');
  });

  it('refuses a species name with no usable characters', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-a', '!!!', null, PNG);

    expect(result.saved).toBe(false);
    expect(dependencies.storage.save).not.toHaveBeenCalled();
  });
});
