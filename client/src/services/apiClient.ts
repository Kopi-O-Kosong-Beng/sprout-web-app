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

/** Public-facing fallbacks when a response body carries no message of its own. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid input. Check the form fields and try again.',
  401: 'Not authorised. Log in first.',
  403: 'Email is not verified. Open the verification link, then refresh.',
  404: 'Not found.',
  409: 'This already exists.',
  429: 'Too many requests. Wait a few minutes and try again.',
  500: 'Server error. Try again shortly.',
};

/** Surface the human-readable reason for a failed API call: the backend's
 *  `{ error: string }` body first, then plain-text bodies (e.g. the rate
 *  limiter), then a friendly per-status message — never axios's generic
 *  "Request failed with status code NNN".
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Network error. Check that the backend is running.';
    const { data, status } = err.response;
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if (typeof data === 'string' && data.trim() && data.length <= 300) {
      return data.trim();
    }
    return STATUS_MESSAGES[status] ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export default apiClient;
export { API_BASE_URL };
