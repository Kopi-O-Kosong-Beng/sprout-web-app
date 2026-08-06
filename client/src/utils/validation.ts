/** Client-side mirror of the backend's password rule
 *  (server/services/password-policy.ts) — same six checks, used by Signup and
 *  the Reset Password step so users see failures before the request is sent.
 *  The backend remains the source of truth.
 *
 *  The composition rules are ASCII-only on purpose; the reasoning, and the
 *  trade-off it carries for non-Latin passwords, is written up in that file.
 *  What matters here is that the labels state the rule that is actually
 *  enforced: "One lowercase letter" told someone whose password was
 *  "ÄÖÜäöü99!" that it had none, which is false — it has three. Naming the
 *  a-z / A-Z / 0-9 ranges is the honest version of the same rule.
 */
export interface PasswordCriterion {
  label: string;
  met: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

/** Mirrors MAX_PASSWORD_BYTES. bcrypt truncates at 72 bytes, so anything past
 *  that is silently discarded by the hash — see the server file for why this
 *  is measured in UTF-8 bytes and not characters. */
export const MAX_PASSWORD_BYTES = 72;

/** Buffer is Node-only, so the browser mirror counts bytes with TextEncoder.
 *  Both answer the same question: how many bytes will bcrypt actually see? */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export function getPasswordCriteria(password: string): PasswordCriterion[] {
  const bytes = passwordByteLength(password);
  return [
    {
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      /* Shows the running count, because the limit is in bytes and a password
         with emoji or non-Latin letters hits it sooner than its character
         count suggests. Without the number, "At most 72 characters" would be
         the next thing on this list to mislead somebody. */
      label: `At most ${MAX_PASSWORD_BYTES} characters (${bytes} used)`,
      met: bytes <= MAX_PASSWORD_BYTES,
    },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    { label: 'One symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return getPasswordCriteria(password).every((c) => c.met);
}
