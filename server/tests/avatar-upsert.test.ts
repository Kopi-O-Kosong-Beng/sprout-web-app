import avatarRepository from '../repositories/avatars';
import type { ScanUpsertInput } from '../models/avatar';
import { clearFirestore } from './firestore-test-utils';

const USER = 'user-scan-1';

function input(overrides: Partial<ScanUpsertInput> = {}): ScanUpsertInput {
  return {
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    spriteUrl: 'https://example.test/sprites/monstera_deliciosa/v1.png',
    stats: { hp: 120, attack: 55, defense: 60, speed: 40 },
    metadata: null,
    ...overrides,
  };
}

describe('avatar upsertFromScan', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('creates a persistent web record on the first scan', async () => {
    const { record, created } = await avatarRepository.upsertFromScan(USER, input());

    expect(created).toBe(true);
    expect(record.userId).toBe(USER);
    expect(record.speciesName).toBe('Monstera deliciosa');
    expect(record.speciesFamily).toBe('Araceae');
    expect(record.source).toBe('web');
    expect(record.isTemporary).toBe(false);
    expect(record.expiresAt).toBeNull();
    expect(record.stats).toEqual({ hp: 120, attack: 55, defense: 60, speed: 40 });
  });

  it('does not duplicate when the same species is scanned again', async () => {
    const first = await avatarRepository.upsertFromScan(USER, input());
    const second = await avatarRepository.upsertFromScan(USER, input());

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);

    const page = await avatarRepository.listByUser(USER, 1, 20);
    expect(page.total).toBe(1);
  });

  it('treats casing and punctuation drift as the same species', async () => {
    await avatarRepository.upsertFromScan(USER, input());
    const again = await avatarRepository.upsertFromScan(
      USER,
      input({ speciesName: 'monstera  DELICIOSA!' })
    );

    expect(again.created).toBe(false);
    const page = await avatarRepository.listByUser(USER, 1, 20);
    expect(page.total).toBe(1);
  });

  it('keeps the original discoveredAt and stamps lastSeenAt on a repeat', async () => {
    const first = await avatarRepository.upsertFromScan(USER, input());
    const second = await avatarRepository.upsertFromScan(USER, input());

    expect(second.record.discoveredAt).toBe(first.record.discoveredAt);
    const lastSeenAt = (second.record.metadata ?? {}).lastSeenAt;
    expect(typeof lastSeenAt).toBe('string');
    expect(Date.parse(String(lastSeenAt))).not.toBeNaN();
  });

  it('keeps different species as separate records', async () => {
    await avatarRepository.upsertFromScan(USER, input());
    await avatarRepository.upsertFromScan(USER, input({ speciesName: 'Quercus robur' }));

    const page = await avatarRepository.listByUser(USER, 1, 20);
    expect(page.total).toBe(2);
  });

  it('keeps one user’s scan out of another user’s archive', async () => {
    await avatarRepository.upsertFromScan(USER, input());
    await avatarRepository.upsertFromScan('user-scan-2', input());

    expect((await avatarRepository.listByUser(USER, 1, 20)).total).toBe(1);
    expect((await avatarRepository.listByUser('user-scan-2', 1, 20)).total).toBe(1);
  });

  it('creates a record that is immediately battle eligible', async () => {
    const { record } = await avatarRepository.upsertFromScan(USER, input());
    const { isAvatarBattleEligible } = await import('../data/battle-eligibility');

    expect(isAvatarBattleEligible(record, new Date())).toBe(true);
  });
});
