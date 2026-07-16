/** Client-side mirror of the backend's assertStrongPassword
 *  (server/services/auth.service.ts) — same five rules, used by Signup and the
 *  Reset Password step so users see failures before the request is sent.
 *  The backend remains the source of truth.
 */
export interface PasswordCriterion {
  label: string;
  met: boolean;
}

export function getPasswordCriteria(password: string): PasswordCriterion[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return getPasswordCriteria(password).every((c) => c.met);
}
