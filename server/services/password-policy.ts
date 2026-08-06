/**
 * The one definition of what counts as a strong password.
 *
 * There were three copies of this rule — auth.service's assertStrongPassword,
 * the seed-admin script's inline duplicate, and the client's mirror in
 * client/src/utils/validation.ts. The seed script's own comment called the
 * duplication out as a hazard ("a seeded account that could not have been
 * created through the UI would be a silent hole in the password policy"), so
 * the two server-side copies now share this module. The client still keeps a
 * mirror, because it must render per-criterion feedback without a round trip;
 * that file points back here.
 *
 * The composition rules are ASCII-only ON PURPOSE, and it is a real trade-off:
 * a password of Cyrillic, Greek or accented-Latin letters fails the case
 * checks, and a CJK password fails them too while counting as a "symbol".
 * Every uppercase/lowercase requirement excludes caseless scripts no matter
 * how it is written, so widening it is a policy decision rather than a bug
 * fix. It was raised and deliberately kept; what changed is that the criteria
 * no longer claim otherwise — see PASSWORD_CRITERIA_LABELS.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The ceiling, in UTF-8 BYTES rather than characters.
 *
 * bcrypt silently truncates its input at 72 bytes — verified against the
 * bcrypt 6.0.0 in this workspace, where two passwords differing only after
 * byte 72 produce a matching hash. Accepting anything longer means quietly
 * ignoring the tail: a user who lengthens a 72-byte password to "strengthen"
 * it changes nothing, and two different passwords can open the same account.
 *
 * Bytes, not characters, because the symbol rule accepts any non-alphanumeric
 * — including emoji and CJK, which cost up to four bytes each. Capping 72
 * characters would still let a 288-byte password through and hand three
 * quarters of it to bcrypt's bit bucket.
 */
export const MAX_PASSWORD_BYTES = 72;

export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, 'utf8');
}

/** Each rule, in the order the signup form lists them. */
export function passwordFailures(password: string): string[] {
  const failures: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) failures.push('too short');
  if (passwordByteLength(password) > MAX_PASSWORD_BYTES) failures.push('too long');
  if (!/[a-z]/.test(password)) failures.push('no a-z letter');
  if (!/[A-Z]/.test(password)) failures.push('no A-Z letter');
  if (!/[0-9]/.test(password)) failures.push('no 0-9 digit');
  if (!/[^A-Za-z0-9]/.test(password)) failures.push('no symbol');
  return failures;
}

export function isStrongPassword(password: string): boolean {
  return passwordFailures(password).length === 0;
}

/**
 * The message shown when a password is refused.
 *
 * Deliberately names the ASCII ranges rather than saying "a lowercase letter".
 * The old wording told someone whose password was "ÄÖÜäöü99!" that it had no
 * lowercase letter, which is simply false — it has three. Saying "a-z" states
 * the rule that is actually enforced.
 *
 * Kept to one line and clear of braces, brackets and URLs so the client's
 * extractApiError treats it as copy fit to show rather than machine output.
 */
export const PASSWORD_POLICY_MESSAGE =
  `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_BYTES} characters and include ` +
  'a lowercase letter (a-z), an uppercase letter (A-Z), a number (0-9), and a symbol.';
