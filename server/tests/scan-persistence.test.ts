import {
  persistScan,
  scopeSpeciesKeyToUser,
  type ScanPersistenceDependencies,
} from '../services/scan-persistence';
import type { AvatarRecord } from '../models/avatar';
import { sanitizeSpeciesKey } from '../pipeline/dex';

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

/** Identification succeeded and named a real species — the canonical case. */
const IDENTIFIED = { identified: true };

describe('persistScan', () => {
  it('stores the sprite, records the discovery, and writes the archive row', async () => {
    const dependencies = deps();
    const result = await persistScan(
      dependencies,
      'user-a',
      'Fern',
      'Polypodiaceae',
      PNG,
      IDENTIFIED
    );

    expect(dependencies.storage.save).toHaveBeenCalledWith('fern', PNG);
    expect(dependencies.dex.recordDiscovery).toHaveBeenCalledWith('fern', 'user-a', 'Fern');
    expect(result.saved).toBe(true);
    expect(result.avatarId).toBe('avatar-1');
  });

  it('passes the stored sprite URL through to the archive record', async () => {
    const dependencies = deps();
    await persistScan(dependencies, 'user-a', 'Fern', null, PNG, IDENTIFIED);

    expect(dependencies.avatars.upsertFromScan).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ spriteUrl: 'https://cdn.test/fern.png' })
    );
  });

  it('reports a storage failure without throwing', async () => {
    const dependencies = deps({
      storage: { save: jest.fn().mockRejectedValue(new Error('bucket unreachable')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG, IDENTIFIED);

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
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG, IDENTIFIED);

    expect(result.saved).toBe(false);
    expect(result.avatarId).toBeNull();
    expect(result.saveError).toContain('dex write conflict');
  });

  it('reports a Firestore failure without throwing', async () => {
    const dependencies = deps({
      avatars: { upsertFromScan: jest.fn().mockRejectedValue(new Error('firestore down')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG, IDENTIFIED);

    expect(result.saved).toBe(false);
    expect(result.saveError).toContain('firestore down');
  });

  it('refuses a species name with no usable characters', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-a', '!!!', null, PNG, IDENTIFIED);

    expect(result.saved).toBe(false);
    expect(dependencies.storage.save).not.toHaveBeenCalled();
  });
});

/** Spec section E: the client reads a resolved display name, never a UID. */
describe('persistScan discovery block', () => {
  it('returns the resolved block rather than the raw dex record', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-b', 'Fern', null, PNG, IDENTIFIED);

    expect(dependencies.resolveDiscovery).toHaveBeenCalledWith(DEX, 'user-b');
    expect(result.discovery).toEqual(RESOLVED);
    expect(result.discovery).not.toHaveProperty('firstDiscoveredBy');
    expect(JSON.stringify(result)).not.toContain('user-a');
  });

  it('still saves the scan when the display-name lookup throws', async () => {
    const dependencies = deps({
      resolveDiscovery: jest.fn().mockRejectedValue(new Error('users collection unreadable')),
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG, IDENTIFIED);

    expect(result.saved).toBe(true);
    expect(result.avatarId).toBe('avatar-1');
    expect(result.discovery).toBeNull();
  });

  it('carries a null resolution straight through', async () => {
    const dependencies = deps({ resolveDiscovery: jest.fn().mockResolvedValue(null) });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG, IDENTIFIED);

    expect(result.saved).toBe(true);
    expect(result.discovery).toBeNull();
  });
});

/** A failed identification, or the keyless mock, is not a real species. */
describe('persistScan unidentified scans', () => {
  const UNIDENTIFIED = { identified: false };

  it('scopes the species key to the scanning user', async () => {
    const dependencies = deps();
    await persistScan(
      dependencies,
      'user-a',
      'Unknown Plant Species',
      null,
      PNG,
      UNIDENTIFIED
    );

    const scoped = scopeSpeciesKeyToUser('unknown_plant_species', 'user-a');
    expect(dependencies.storage.save).toHaveBeenCalledWith(scoped, PNG);
    expect(dependencies.dex.recordDiscovery).toHaveBeenCalledWith(
      scoped,
      'user-a',
      'Unknown Plant Species'
    );
  });

  it('gives two users different keys for the same placeholder name', async () => {
    const first = deps();
    const second = deps();
    await persistScan(first, 'user-a', 'Unknown Plant Species', null, PNG, UNIDENTIFIED);
    await persistScan(second, 'user-b', 'Unknown Plant Species', null, PNG, UNIDENTIFIED);

    const keyFor = (dependencies: ScanPersistenceDependencies) =>
      (dependencies.storage.save as jest.Mock).mock.calls[0][0];
    expect(keyFor(first)).not.toBe(keyFor(second));
  });

  it('leaves an identified species fully canonical', async () => {
    const first = deps();
    const second = deps();
    await persistScan(first, 'user-a', 'Fern', null, PNG, IDENTIFIED);
    await persistScan(second, 'user-b', 'Fern', null, PNG, IDENTIFIED);

    expect(first.storage.save).toHaveBeenCalledWith('fern', PNG);
    expect(second.storage.save).toHaveBeenCalledWith('fern', PNG);
  });
});

describe('scopeSpeciesKeyToUser', () => {
  it('produces a key valid as a Firestore id and a storage path segment', () => {
    const key = scopeSpeciesKeyToUser('unknown_plant_species', 'AbC123xyz');

    expect(key).toMatch(/^[a-z0-9_]+$/);
    expect(key).not.toContain('/');
    expect(key.length).toBeLessThan(1500);
  });

  it('separates on a marker no real species name can produce', () => {
    // sanitizeSpeciesKey collapses runs of underscores, so no canonical key can
    // contain '__' — a species literally named "Fern u <uid>" cannot collide.
    expect(sanitizeSpeciesKey('Fern  u  616263')).not.toContain('__');
    expect(scopeSpeciesKeyToUser('fern', 'abc')).toContain('__u_');
  });

  it('keeps case-different uids apart', () => {
    // Firebase UIDs are case-sensitive; sanitizeSpeciesKey lowercases, so the
    // uid is hex-encoded instead of sanitized.
    expect(scopeSpeciesKeyToUser('fern', 'AbC')).not.toBe(
      scopeSpeciesKeyToUser('fern', 'aBc')
    );
  });
});
