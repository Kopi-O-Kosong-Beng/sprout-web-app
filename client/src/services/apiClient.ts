import axios from 'axios';
import { signOut } from 'firebase/auth';
import { getDevSession } from './devSession';
import { getSproutFirebaseAuth, isFirebaseConfigured } from './firebaseClient';

// VITE_API_URL lets this point at a local server today and a deployed one
// later, without a code change — set it in Vercel project settings.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach a fresh Firebase ID token to every request. The SDK caches and
// auto-refreshes it, so this never goes stale. Callers that set their own
// Authorization header (the /test page's explicit-token flows) win.
apiClient.interceptors.request.use(async (config) => {
  // Local-only: a dev session has no Firebase user and therefore no token, so
  // it identifies itself with the headers AUTH_DEV_BYPASS reads instead. In a
  // production build getDevSession() is hard-wired to null, so this branch is
  // never taken and the token path below is the only one that runs.
  const devSession = getDevSession();
  if (devSession) {
    config.headers['x-dev-uid'] = devSession.uid;
    config.headers['x-dev-email'] = devSession.email;
    return config;
  }
  if (!config.headers.Authorization && isFirebaseConfigured()) {
    const token = await getSproutFirebaseAuth().currentUser?.getIdToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 = missing/invalid/expired token → force sign-out; AuthContext reacts via
// onAuthStateChanged. 403 (unverified email) is a legitimate signed-in state
// and must NOT sign the user out.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && isFirebaseConfigured()) {
      const auth = getSproutFirebaseAuth();
      if (auth.currentUser) await signOut(auth).catch(() => {});
    }
    return Promise.reject(error);
  }
);

/**
 * What went wrong, in a form the UI can branch on.
 *
 * 'offline' is the one worth separating by name: it is the only failure the
 * player can personally fix, and it is common on a phone in a garden.
 */
export type ApiErrorKind =
  | 'offline'
  | 'unauthorised'
  | 'unverified'
  | 'invalid'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'server'
  | 'unknown';

/**
 * Player-facing copy, per failure. Written here rather than taken from the
 * response on purpose — see extractApiError.
 */
const KIND_MESSAGES: Record<ApiErrorKind, string> = {
  offline: 'No connection. Reconnect to wifi or mobile data, then try again.',
  unauthorised: 'Please log in again to continue.',
  unverified: 'Verify your email first — open the link we sent, then refresh.',
  invalid: 'Something in that form was not right. Check the fields and try again.',
  notFound: 'That is not there any more.',
  conflict: 'That already exists.',
  rateLimited: 'Too many tries. Wait a few minutes and try again.',
  server: 'Something went wrong on our end. Try again shortly.',
  unknown: '',
};

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorised';
  if (status === 403) return 'unverified';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  if (status >= 400) return 'invalid';
  return 'unknown';
}

/** Classifies a failure without deciding how to say it. */
export function classifyApiError(err: unknown): { kind: ApiErrorKind; status?: number } {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      // No response at all: the request never landed. Distinguish a genuinely
      // offline device from a server that is down, since only the first is
      // something the player can act on.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      return { kind: offline ? 'offline' : 'server' };
    }
    return { kind: kindForStatus(err.response.status), status: err.response.status };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'offline' };
  }
  return { kind: 'unknown' };
}

/**
 * A message fit to show a player.
 *
 * It deliberately does NOT return what the server said. The backend put
 * `err.message` straight into the body for every status under 500
 * (server/middleware/error.middleware.ts), so whatever was thrown became UI
 * text: raw Joi output like `"password" length must be at least 8 characters
 * long`, and any internal message a 4xx path happened to carry. This function
 * used to hand that through verbatim, plus any plain-text body up to 300
 * characters. Two hundred screens' worth of wording was effectively delegated
 * to whatever threw last.
 *
 * Copy now lives on this side, keyed by what actually happened, so it is
 * reviewable in one place and no exception text can reach a player. The
 * server's own text is not discarded — it goes to the console, where the person
 * debugging is.
 *
 * `fallback` still wins for the cases a caller understands better than this
 * does ("Could not remove that plant."), which is why every call site passes
 * one.
 */
/**
 * Statuses whose `{ error }` body is deliberate, player-facing copy written by
 * a controller — "You cannot delete your own admin account.", "Avatar not
 * found." Those say more than anything generic this side could substitute, so
 * they are shown.
 *
 * 400 is included but filtered hardest, because it carries two very different
 * things: business-rule rejections a controller wrote on purpose ("You cannot
 * delete your own admin account.") and raw Joi validation output ("\"password\"
 * length must be at least 8 characters long"). The first is the best sentence
 * anyone could show; the second is schema-speak naming a field the player never
 * saw. isSchemaComplaint separates them.
 *
 * 5xx never reaches here as text — the server's error middleware already
 * collapses it to "Internal server error." — and is treated as generic anyway.
 */
const TRUSTED_MESSAGE_STATUSES = new Set([400, 401, 403, 404, 409, 429]);

/**
 * Joi's own wording, which always leads with the offending key in quotes:
 * `"email" must be a valid email`, `"name" is not allowed to be empty`. The
 * quoted key is a schema path, not a label the player has seen, so these are
 * replaced by the caller's own wording for the form.
 */
function isSchemaComplaint(message: string): boolean {
  return /^"[^"]+"\s/.test(message);
}

/** Guards against a controller message that is really machine output: too
 *  long to read, multi-line, or carrying a stack or code frame. */
function looksLikeCopy(message: string): boolean {
  if (isSchemaComplaint(message)) return false;
  if (message.length > 160) return false;
  if (/[\n\r]/.test(message)) return false;
  return !/(\bat\s+\w+\.\w+|Error:|\bundefined\b|[{}[\]]|https?:\/\/)/.test(message);
}

/**
 * A message fit to show a player.
 *
 * The backend puts `err.message` straight into the body for every status under
 * 500 (server/middleware/error.middleware.ts), so whatever was thrown became UI
 * text. This used to hand all of it through, plus any plain-text body up to 300
 * characters — which is how raw Joi output and the rate limiter's bare string
 * ended up on screen.
 *
 * Now only the statuses that carry hand-written copy are trusted, and only when
 * the text still reads like a sentence. Everything else falls back to wording
 * chosen on this side. The server's original text is not lost — it goes to the
 * console, where the person debugging is.
 */
export function extractApiError(err: unknown, fallback: string): string {
  // Not an axios failure: this is a client-side Error, whose message was
  // written here (often by an earlier extractApiError call). Keep it.
  if (!axios.isAxiosError(err)) {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  const { kind, status } = classifyApiError(err);
  const data = err.response?.data;

  if (import.meta.env.DEV && err.response) {
    console.warn(
      `[api] ${err.config?.method?.toUpperCase() ?? 'REQ'} ${err.config?.url ?? ''} -> ${status}`,
      data
    );
  }

  if (status !== undefined && TRUSTED_MESSAGE_STATUSES.has(status)) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error?: unknown }).error
        : undefined;
    if (typeof message === 'string' && message.trim() && looksLikeCopy(message.trim())) {
      return message.trim();
    }
  }

  if (kind === 'unknown') return fallback;
  if (kind === 'invalid') return fallback || KIND_MESSAGES.invalid;
  return KIND_MESSAGES[kind];
}

export default apiClient;
export { API_BASE_URL };
