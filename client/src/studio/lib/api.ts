import { apiUrl } from '../../services/pipelineStream';
import {
  getSproutFirebaseAuth,
  isFirebaseConfigured,
} from '../../services/firebaseClient';
import { getDevSession } from '../../services/devSession';

/**
 * Fetch wrapper for the studio's own endpoints.
 *
 * Sprout_Dev_Platform served its React app and its Express routes from one
 * origin, so its components could call `/api/...` relatively and needed no
 * credentials. Here the client is a static Vercel deployment and the API is a
 * separate Render service, so every call needs the absolute base URL — and the
 * platform routes now sit behind the same admin guard as the rest of /api, so
 * every call needs credentials too.
 *
 * Plain fetch rather than the shared axios client because two of these
 * endpoints stream server-sent events, which the axios browser adapter buffers.
 * That is also how this drifted: apiClient's request interceptor learned about
 * dev sessions and this wrapper, being a separate implementation of the same
 * job, never did.
 */
export async function studioFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  /*
    A dev session has no Firebase user and therefore no ID token — it
    identifies itself with the headers AUTH_DEV_BYPASS reads, exactly as
    apiClient does. Without this branch every studio call made under a local
    dev login went out with no credential at all and came back 401, while the
    app around it looked perfectly signed in because the nav reads a different
    source. Most studio panels swallow their fetch errors, so the failure was
    invisible until a page that reports them properly went in.

    getDevSession() is hard-wired to null in a production build, so this cannot
    weaken the deployed studio.
  */
  const devSession = getDevSession();
  if (devSession) {
    headers.set('x-dev-uid', devSession.uid);
    headers.set('x-dev-email', devSession.email);
  } else if (isFirebaseConfigured()) {
    const token = await getSproutFirebaseAuth().currentUser?.getIdToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(apiUrl(path), { ...init, headers });
}
