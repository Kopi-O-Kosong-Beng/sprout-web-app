import { persistScan, type ScanPersistenceDependencies } from '../services/scan-persistence';
import type { AvatarRecord } from '../models/avatar';

const PNG = Buffer.from('png');

const RECORD = { id: 'avatar-1' } as AvatarRecord;

const DEX = {
  speciesKey: 'fern',
  speciesName: 'Fern',
  firstDiscoveredBy: 'user-a',
  firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
  discoveryCount: 1,
};

const RESOLVED = {
  firstDiscoveredByName: 'Justin',
  firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
  discoveryCount: 1,
  isFirstDiscoverer: false,
};

function deps(overrides: Partial<ScanPersistenceDependencies> = {}): ScanPersistenceDependencies {
  return {
    storage: { save: jest.fn().mockResolvedValue('https://cdn.test/fern.png') },
    dex: {
      recordDiscovery: jest.fn().mockResolvedValue(DEX),
      get: jest.fn(),
    },
    avatars: { upsertFromScan: jest.fn().mockResolvedValue({ record: RECORD, created: true }) },
    resolveDiscovery: jest.fn().mockResolvedValue(RESOLVED),
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
    expect(result.saveError).toBeTruthy();
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
  });

  it('reports a Firestore failure without throwing', async () => {
    const dependencies = deps({
      avatars: { upsertFromScan: jest.fn().mockRejectedValue(new Error('firestore down')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(false);
  });

  it('refuses a species name with no usable characters', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-a', '!!!', null, PNG);

    expect(result.saved).toBe(false);
    expect(dependencies.storage.save).not.toHaveBeenCalled();
  });
});

/** Spec section E: the client reads a resolved display name, never a UID. */
describe('persistScan discovery block', () => {
  it('returns the resolved block rather than the raw dex record', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-b', 'Fern', null, PNG);

    expect(dependencies.resolveDiscovery).toHaveBeenCalledWith(DEX, 'user-b');
    expect(result.discovery).toEqual(RESOLVED);
    expect(result.discovery).not.toHaveProperty('firstDiscoveredBy');
    expect(JSON.stringify(result)).not.toContain('user-a');
  });

  it('still saves the scan when the display-name lookup throws', async () => {
    const dependencies = deps({
      resolveDiscovery: jest.fn().mockRejectedValue(new Error('users collection unreadable')),
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(true);
    expect(result.avatarId).toBe('avatar-1');
    expect(result.discovery).toBeNull();
  });

  it('carries a null resolution straight through', async () => {
    const dependencies = deps({ resolveDiscovery: jest.fn().mockResolvedValue(null) });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(true);
    expect(result.discovery).toBeNull();
  });
});
