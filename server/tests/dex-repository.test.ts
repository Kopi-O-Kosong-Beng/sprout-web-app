import dexRepository from '../repositories/dex';
import { clearFirestore } from './firestore-test-utils';

describe('dex repository', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('records the first discoverer of an unseen species', async () => {
    const result = await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');

    expect(result.firstDiscoveredBy).toBe('user-a');
    expect(result.discoveryCount).toBe(1);
    expect(result.speciesName).toBe('Fern');
    expect(Date.parse(result.firstDiscoveredAt)).not.toBeNaN();
  });

  it('keeps the original discoverer when someone else finds it later', async () => {
    const first = await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const second = await dexRepository.recordDiscovery('fern', 'user-b', 'Fern');

    expect(second.firstDiscoveredBy).toBe('user-a');
    expect(second.firstDiscoveredAt).toBe(first.firstDiscoveredAt);
    expect(second.discoveryCount).toBe(2);
  });

  it('counts every discovery, including repeats by the same user', async () => {
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const third = await dexRepository.recordDiscovery('fern', 'user-c', 'Fern');

    expect(third.discoveryCount).toBe(3);
  });

  it('keeps species independent of one another', async () => {
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const oak = await dexRepository.recordDiscovery('oak', 'user-b', 'Oak');

    expect(oak.firstDiscoveredBy).toBe('user-b');
    expect(oak.discoveryCount).toBe(1);
  });

  it('returns null for a species nobody has scanned', async () => {
    expect(await dexRepository.get('never_seen')).toBeNull();
  });

  it('reads back a recorded discovery', async () => {
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const found = await dexRepository.get('fern');

    expect(found).not.toBeNull();
    expect(found!.firstDiscoveredBy).toBe('user-a');
  });
});
