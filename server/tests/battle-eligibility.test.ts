import { isAvatarBattleEligible } from '../data/battle-eligibility';

const NOW = new Date('2026-07-23T12:00:00.000Z');

describe('avatar battle eligibility', () => {
  it.each([
    {
      label: 'permanent avatar with an old expiry value',
      avatar: { isTemporary: false, expiresAt: '2020-01-01T00:00:00.000Z' },
      expected: true,
    },
    {
      label: 'temporary avatar with a future expiry',
      avatar: { isTemporary: true, expiresAt: '2026-07-23T12:00:00.001Z' },
      expected: true,
    },
    {
      label: 'temporary avatar at the exact expiry boundary',
      avatar: { isTemporary: true, expiresAt: '2026-07-23T12:00:00.000Z' },
      expected: false,
    },
    {
      label: 'temporary avatar with a past expiry',
      avatar: { isTemporary: true, expiresAt: '2026-07-23T11:59:59.999Z' },
      expected: false,
    },
    {
      label: 'temporary avatar without an expiry',
      avatar: { isTemporary: true, expiresAt: null },
      expected: true,
    },
    {
      label: 'temporary avatar with an invalid legacy expiry',
      avatar: { isTemporary: true, expiresAt: 'not-a-timestamp' },
      expected: true,
    },
  ])('$label => $expected', ({ avatar, expected }) => {
    expect(isAvatarBattleEligible(avatar, NOW)).toBe(expected);
  });
});
