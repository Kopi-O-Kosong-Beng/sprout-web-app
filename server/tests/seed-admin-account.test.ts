/** Input resolution for the admin seed. Pure — no emulator, no Firebase: the
 *  script's require.main guard keeps importing it from running the seed.
 *
 *  Worth testing because this is the one place a weak password could enter the
 *  system without passing signup's policy, and because a seed that silently
 *  used the wrong email would create a working account that the ADMIN_EMAILS
 *  allowlist then refuses — a confusing failure to debug.
 */
import { resolveSeedInput } from '../scripts/seed-admin-account';

const STRONG = 'heySPROUT$1';

describe('resolveSeedInput', () => {
  it('defaults to the team admin address when nothing is supplied', () => {
    expect(resolveSeedInput([], { SEED_ADMIN_PASSWORD: STRONG })).toEqual({
      email: 'sprout@gmail.com',
      password: STRONG,
      displayName: 'Sprout Admin',
    });
  });

  it('prefers arguments over environment variables', () => {
    const resolved = resolveSeedInput(['Other@Example.com', STRONG, 'Other Admin'], {
      SEED_ADMIN_EMAIL: 'env@example.com',
      SEED_ADMIN_PASSWORD: 'Ignored$9',
      SEED_ADMIN_DISPLAY_NAME: 'Env Admin',
    });

    expect(resolved).toEqual({
      email: 'other@example.com',
      password: STRONG,
      displayName: 'Other Admin',
    });
  });

  it('normalises the email so the allowlist comparison cannot miss', () => {
    expect(resolveSeedInput(['  SPROUT@Gmail.com  ', STRONG], {}).email).toBe(
      'sprout@gmail.com'
    );
  });

  it('explains how to supply a password instead of seeding a blank one', () => {
    expect(() => resolveSeedInput([], {})).toThrow(/No password supplied/);
    expect(() => resolveSeedInput([], {})).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  // Same rule as auth.service.ts assertStrongPassword: a seeded account must
  // not be weaker than one the signup form would have accepted.
  it.each([
    ['too short', 'hey$1A'],
    ['no uppercase', 'heysprout$1'],
    ['no lowercase', 'HEYSPROUT$1'],
    ['no digit', 'heySPROUT$$'],
    ['no symbol', 'heySPROUT11'],
  ])('rejects a password with %s', (_case, password) => {
    expect(() => resolveSeedInput(['admin@example.com', password], {})).toThrow(
      /at least 8 characters/
    );
  });

  it('accepts the display-name characters signup allows and rejects the rest', () => {
    expect(
      resolveSeedInput(['a@b.com', STRONG, 'Sprout_Admin-2 '], {}).displayName
    ).toBe('Sprout_Admin-2');
    expect(() => resolveSeedInput(['a@b.com', STRONG, 'Sprout! Admin'], {})).toThrow(
      /Display name/
    );
    expect(() =>
      resolveSeedInput(['a@b.com', STRONG, 'x'.repeat(51)], {})
    ).toThrow(/Display name/);
  });
});
