/**
 * Local-only sign-in shortcut, for demoing without a Firebase password.
 *
 * Signing in as DEV_ADMIN_EMAIL with any password at all establishes a "dev
 * session": no Firebase user, no ID token, just a uid and an email that the
 * apiClient sends as the `x-dev-uid` / `x-dev-email` headers the server's
 * AUTH_DEV_BYPASS already understands. The server derives the profile and the
 * admin flag from that email exactly as it would from a real token, so the
 * dashboard being reachable this way still proves the allowlist works.
 *
 * IT CANNOT ACTIVATE IN A DEPLOYED BUILD. Every entry point below goes through
 * isDevLoginEnabled(), and `import.meta.env.DEV` compiles to a literal `false`
 * in `vite build` — verified in the output bundle, where it minifies to
 * `function(){return!1}`, so getDevSession() returns null unconditionally and
 * the apiClient never sends the headers, whatever is in localStorage.
 *
 * Be accurate about what that does and does not mean: the functions and the
 * strings below are NOT tree-shaken out: `test@sprout.com` and
 * `sprout-dev-session` are both readable in the production bundle. They are
 * inert, not absent. Nothing is protected by their being secret, and nothing
 * should be — the server half is guarded independently by
 * `AUTH_DEV_BYPASS === 'true'` *and* `NODE_ENV !== 'production'` (see
 * server/middleware/auth.middleware.ts). Neither half alone opens anything: a
 * production API refuses these headers even from a locally-run client, and a
 * production client never sends them even against a local API.
 *
 * The password is not checked because there is nothing to check it against —
 * this account need not exist in Firebase at all. That is precisely why it is
 * fenced to local builds.
 */

/** The one identity the shortcut will accept. Must also be in the server's
 *  SUPER_ADMIN_EMAILS for the dev session to come back as an operator (the
 *  tier that opens /admin, /studio, and /test). */
export const DEV_ADMIN_EMAIL = 'test@sprout.com';

/** Stable uid for the dev admin, so its archive and battles persist between
 *  local sessions instead of scattering across random ids. */
const DEV_ADMIN_UID = 'dev-admin-0001';

const STORAGE_KEY = 'sprout-dev-session';

export interface DevSession {
  uid: string;
  email: string;
}

/** True only in a local dev build. The single switch everything else reads. */
export function isDevLoginEnabled(): boolean {
  return import.meta.env.DEV;
}

/** Whether these credentials should take the shortcut. The password is
 *  deliberately not a parameter: it is not consulted. */
export function isDevAdminEmail(email: string): boolean {
  if (!isDevLoginEnabled()) return false;
  return email.trim().toLowerCase() === DEV_ADMIN_EMAIL;
}

export function getDevSession(): DevSession | null {
  if (!isDevLoginEnabled()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevSession>;
    if (typeof parsed?.uid !== 'string' || typeof parsed?.email !== 'string') {
      return null;
    }
    return { uid: parsed.uid, email: parsed.email };
  } catch {
    // Unparseable or storage-denied: no session rather than a broken one.
    return null;
  }
}

export function startDevSession(): DevSession | null {
  if (!isDevLoginEnabled()) return null;
  const session: DevSession = { uid: DEV_ADMIN_UID, email: DEV_ADMIN_EMAIL };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private-mode storage refusal: the session still works for this tab.
  }
  return session;
}

export function endDevSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; a session that cannot be cleared cannot have been stored.
  }
}
