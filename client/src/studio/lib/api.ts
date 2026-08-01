import { apiUrl } from '../../services/pipelineStream';
import {
  getSproutFirebaseAuth,
  isFirebaseConfigured,
} from '../../services/firebaseClient';

/**
 * Fetch wrapper for the studio's own endpoints.
 *
 * Sprout_Dev_Platform served its React app and its Express routes from one
 * origin, so its components could call `/api/...` relatively and needed no
 * credentials. Here the client is a static Vercel deployment and the API is a
 * separate Render service, so every call needs the absolute base URL — and the
 * platform routes now sit behind the same admin guard as the rest of /api, so
 * every call needs the Firebase ID token too.
 *
 * Plain fetch rather than the shared axios client because two of these
 * endpoints stream server-sent events, which the axios browser adapter buffers.
 */
export async function studioFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (isFirebaseConfigured()) {
    const token = await getSproutFirebaseAuth().currentUser?.getIdToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(apiUrl(path), { ...init, headers });
}
