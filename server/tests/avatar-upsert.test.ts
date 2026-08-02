import avatarRepository from '../repositories/avatars';
import type { ScanUpsertInput } from '../models/avatar';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

const USER = 'user-scan-1';

function input(overrides: Partial<ScanUpsertInput> = {}): ScanUpsertInput {
  return {
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    // A camera scan by default; the retention tests below pass 'web' instead.
    source: 'mobile',
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

  it('keeps a camera scan on the first scan', async () => {
    const { record, created } = await avatarRepository.upsertFromScan(USER, input());

    expect(created).toBe(true);
    expect(record.userId).toBe(USER);
    expect(record.speciesName).toBe('Monstera deliciosa');
    expect(record.speciesFamily).toBe('Araceae');
    expect(record.source).toBe('mobile');
    expect(record.isTemporary).toBe(false);
    expect(record.expiresAt).toBeNull();
    expect(record.stats).toEqual({ hp: 120, attack: 55, defense: 60, speed: 40 });
  });

  // Req 6.12: a file off disk could be any picture of anything, so it is a
  // trial run rather than a discovery.
  it('expires an upload 24 hours after it is scanned', async () => {
    const { record } = await avatarRepository.upsertFromScan(
      USER,
      input({ source: 'web' })
    );

    expect(record.source).toBe('web');
    expect(record.isTemporary).toBe(true);
    expect(
      Date.parse(record.expiresAt!) - Date.parse(record.discoveredAt)
    ).toBe(24 * 60 * 60 * 1000);
  });

  // Re-scanning must never shorten a plant's life: uploading a photo of
  // something you already caught with the camera cannot put it on a clock.
  it('upgrades a temporary record on a camera re-scan and never downgrades', async () => {
    const upload = await avatarRepository.upsertFromScan(
      USER,
      input({ source: 'web' })
    );
    expect(upload.record.isTemporary).toBe(true);

    const scan = await avatarRepository.upsertFromScan(USER, input());
    expect(scan.created).toBe(false);
    expect(scan.record.isTemporary).toBe(false);
    expect(scan.record.expiresAt).toBeNull();

    const reupload = await avatarRepository.upsertFromScan(
      USER,
      input({ source: 'web' })
    );
    expect(reupload.record.isTemporary).toBe(false);
    expect(reupload.record.expiresAt).toBeNull();
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

  it('upgrades a matched temporary record to persistent on a real scan', async () => {
    const db = getDb();
    const tempId = 'temp-amanita-1';
    const discoveredAt = new Date('2026-07-01T00:00:00.000Z').toISOString();
    const expiresAt = new Date('2026-07-02T00:00:00.000Z').toISOString();

    // Seed the way an existing temporary record (e.g. the seeded demo
    // Amanita muscaria) actually looks: isTemporary true with a real TTL.
    await db.collection('avatar_records').doc(tempId).set({
      userId: USER,
      speciesName: 'Amanita muscaria',
      speciesFamily: 'Amanitaceae',
      spriteUrl: '/static/sprites/amanita-muscaria.png',
      discoveredAt,
      source: 'web',
      isTemporary: true,
      expiresAt,
      stats: { hp: 74, attack: 91, defense: 28, speed: 55 },
      metadata: { taxonomy: 'fungus' },
    });

    const { record, created } = await avatarRepository.upsertFromScan(
      USER,
      input({
        speciesName: 'Amanita muscaria',
        speciesFamily: 'Amanitaceae',
        stats: { hp: 74, attack: 91, defense: 28, speed: 55 },
      })
    );

    expect(created).toBe(false);
    expect(record.id).toBe(tempId);
    expect(record.isTemporary).toBe(false);
    expect(record.expiresAt).toBeNull();
    expect(record.discoveredAt).toBe(discoveredAt);

    const { isAvatarBattleEligible } = await import('../data/battle-eligibility');
    expect(isAvatarBattleEligible(record, new Date())).toBe(true);

    const persisted = (await db.collection('avatar_records').doc(tempId).get()).data();
    expect(persisted).toMatchObject({
      isTemporary: false,
      expiresAt: null,
      discoveredAt,
    });
  });

  it('rejects a species name that sanitizes to empty with a 400 status', async () => {
    await expect(
      avatarRepository.upsertFromScan(USER, input({ speciesName: '!!!' }))
    ).rejects.toMatchObject({ status: 400 });
  });
});
