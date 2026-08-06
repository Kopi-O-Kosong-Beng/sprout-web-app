import { describe, expect, it } from 'vitest';
import {
  getPasswordCriteria,
  isStrongPassword,
  passwordByteLength,
  MAX_PASSWORD_BYTES,
} from './validation';

/** The label of every unmet rule — what the signup form actually shows in red. */
function unmet(password: string): string[] {
  return getPasswordCriteria(password)
    .filter((c) => !c.met)
    .map((c) => c.label);
}

describe('password criteria', () => {
  it('accepts a password that meets every rule', () => {
    expect(unmet('heySPROUT11$')).toEqual([]);
    expect(isStrongPassword('heySPROUT11$')).toBe(true);
  });

  /*
   * The label bug this replaced: "ÄÖÜäöü99!" was told "One lowercase letter"
   * was unmet while containing three. The rule itself is unchanged and still
   * rejects the password — but it now names the range it actually enforces,
   * so the reason given is true.
   */
  it('names the enforced range rather than claiming there is no lowercase letter', () => {
    const reasons = unmet('ÄÖÜäöü99!');
    expect(reasons).toContain('One lowercase letter (a-z)');
    expect(reasons).toContain('One uppercase letter (A-Z)');
    expect(reasons).not.toContain('One lowercase letter');
    expect(reasons).not.toContain('One uppercase letter');
  });

  it('counts the length cap in bytes and shows the running total', () => {
    const emoji = `heySPROUT11$${'🌱'.repeat(20)}`;
    expect(emoji.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(passwordByteLength(emoji)).toBeGreaterThan(MAX_PASSWORD_BYTES);
    expect(isStrongPassword(emoji)).toBe(false);
    // The count is on screen, because "At most 72 characters" would otherwise
    // look wrong to someone holding 52 characters.
    expect(unmet(emoji)).toContain(
      `At most ${MAX_PASSWORD_BYTES} characters (${passwordByteLength(emoji)} used)`
    );
  });

  it('accepts a password sitting exactly on the cap', () => {
    const atLimit = 'heySPROUT11$'.padEnd(MAX_PASSWORD_BYTES, 'a');
    expect(passwordByteLength(atLimit)).toBe(MAX_PASSWORD_BYTES);
    expect(isStrongPassword(atLimit)).toBe(true);
  });

  /*
   * This mirror exists so signup can show per-rule feedback without a round
   * trip, which is only worth anything if it agrees with the server. These are
   * the same cases as server/tests/password-policy.test.ts; if the two ever
   * disagree, one of these suites goes red.
   */
  it.each([
    ['heySPROUT11$', true],
    ['hey$1A', false],
    ['heysprout$1', false],
    ['HEYSPROUT$1', false],
    ['heySPROUT$$', false],
    ['heySPROUT11', false],
    ['ÄÖÜäöü99!', false],
    ['Пароль99!', false],
    ['日本語パスワード9!', false],
  ])('agrees with the server verdict for %s', (password, expected) => {
    expect(isStrongPassword(password)).toBe(expected);
  });
});
