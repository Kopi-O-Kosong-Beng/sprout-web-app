import bcrypt from 'bcrypt';
import {
  isStrongPassword,
  passwordByteLength,
  passwordFailures,
  MAX_PASSWORD_BYTES,
  PASSWORD_POLICY_MESSAGE,
} from '../services/password-policy';

describe('password policy', () => {
  it('accepts a password that meets every rule', () => {
    expect(passwordFailures('heySPROUT11$')).toEqual([]);
    expect(isStrongPassword('heySPROUT11$')).toBe(true);
  });

  it.each([
    ['hey$1A', 'too short'],
    ['heysprout$1', 'no A-Z letter'],
    ['HEYSPROUT$1', 'no a-z letter'],
    ['heySPROUT$$', 'no 0-9 digit'],
    ['heySPROUT11', 'no symbol'],
  ])('rejects %s', (password, reason) => {
    expect(passwordFailures(password)).toContain(reason);
  });

  /*
   * The ceiling exists because bcrypt truncates, not because long passwords
   * are bad. This is the property that makes the cap necessary: two passwords
   * that differ only past byte 72 are the same password as far as the hash is
   * concerned, so without a cap they would open the same account.
   */
  it('refuses input past the point bcrypt would silently discard', async () => {
    const atLimit = 'heySPROUT11$'.padEnd(MAX_PASSWORD_BYTES, 'a');
    const overLimit = `${atLimit}a`;
    expect(passwordByteLength(atLimit)).toBe(MAX_PASSWORD_BYTES);
    expect(isStrongPassword(atLimit)).toBe(true);
    expect(passwordFailures(overLimit)).toContain('too long');

    // The reason, demonstrated rather than asserted from memory.
    const hash = await bcrypt.hash(atLimit, 4);
    expect(await bcrypt.compare(overLimit, hash)).toBe(true);
  });

  it('counts the cap in bytes, so multi-byte characters cost what they cost', () => {
    // 20 emoji is 52 UTF-16 units with the prefix, but 92 bytes — comfortably
    // under any character-based cap and comfortably past what bcrypt reads.
    const emoji = `heySPROUT11$${'🌱'.repeat(20)}`;
    expect(emoji.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(passwordByteLength(emoji)).toBeGreaterThan(MAX_PASSWORD_BYTES);
    expect(passwordFailures(emoji)).toContain('too long');
  });

  /*
   * Documented, not lamented: the case rules are ASCII-only, so these are
   * refused. That is a standing product decision (raised and kept), and this
   * test exists so changing it is a deliberate act with a visible diff rather
   * than something that drifts. Every uppercase/lowercase requirement excludes
   * caseless scripts, which is why the CJK case fails too.
   */
  it.each([
    ['ÄÖÜäöü99!', 'accented Latin'],
    ['Пароль99!', 'Cyrillic'],
    ['Ωμέγα99!', 'Greek'],
    ['日本語パスワード9!', 'CJK, which has no case at all'],
  ])('still rejects %s (%s) under the ASCII-only rule', (password) => {
    expect(isStrongPassword(password)).toBe(false);
  });

  it('states the enforced ranges instead of claiming a missing lowercase letter', () => {
    // The old copy told "ÄÖÜäöü99!" it had no lowercase letter. It has three.
    expect(PASSWORD_POLICY_MESSAGE).toContain('a-z');
    expect(PASSWORD_POLICY_MESSAGE).toContain('A-Z');
    expect(PASSWORD_POLICY_MESSAGE).toContain('8-72');
    // extractApiError only forwards server copy that still reads as a sentence.
    expect(PASSWORD_POLICY_MESSAGE.length).toBeLessThanOrEqual(160);
    expect(PASSWORD_POLICY_MESSAGE).not.toMatch(/[{}[\]]|https?:\/\//);
  });
});
