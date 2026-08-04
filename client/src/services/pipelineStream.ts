import { getSproutFirebaseAuth, isFirebaseConfigured } from './firebaseClient';
import { API_BASE_URL } from './apiClient';

/**
 * Server-sent-event client for the sprite pipeline.
 *
 * The pipeline streams its progress from a POST (each hop reports as it lands,
 * and the whole run can take most of a minute), so `EventSource` is no use —
 * it only issues GETs. This reads the response body directly instead.
 *
 * axios is not used for the same reason: the browser adapter buffers the whole
 * response, which would defeat the point of streaming. Auth is therefore
 * attached by hand here rather than by the apiClient request interceptor.
 */

export interface PipelineEvent {
  event: string;
  [key: string]: unknown;
}

/** Absolute URL for an API path — the client and server are separate origins. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Why a pipeline run could not start, as something the caller can branch on.
 *
 * The scan screen used to decide by searching the message text for "401", so
 * anything whose wording happened to contain those digits was reported to the
 * player as "please sign in" — which is what an offline device got, since
 * Firebase's own token refresh fails with a network error before the request
 * is ever made. A kind and a status are checkable; a substring is not.
 */
export type PipelineFailureKind = 'offline' | 'unauthorised' | 'http' | 'unknown';

export class PipelineRequestError extends Error {
  readonly kind: PipelineFailureKind;
  readonly status?: number;

  constructor(kind: PipelineFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'PipelineRequestError';
    this.kind = kind;
    this.status = status;
  }
}

/** A fetch/token failure that means "the network did not carry this", not
 *  "the server said no" — a TypeError from fetch, or Firebase's own
 *  auth/network-request-failed while refreshing the token. */
function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true; // fetch's offline/DNS failure
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && code.includes('network-request-failed');
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isFirebaseConfigured()) {
    const token = await getSproutFirebaseAuth().currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * POSTs `body` and invokes `onEvent` for each `data:` frame as it arrives.
 * Resolves when the server closes the stream.
 */
export async function streamPipeline(
  path: string,
  body: unknown,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An abort is the caller's own doing — pass it through untouched so the
    // scan screen can tell "I cancelled" from "it broke".
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (isNetworkFailure(error)) {
      throw new PipelineRequestError(
        'offline',
        'No connection. Check your internet and try again.'
      );
    }
    throw new PipelineRequestError(
      'unknown',
      error instanceof Error ? error.message : String(error)
    );
  }

  if (!response.ok) {
    throw new PipelineRequestError(
      response.status === 401 || response.status === 403 ? 'unauthorised' : 'http',
      `Pipeline API HTTP ${response.status}`,
      response.status
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming is not supported in this browser.');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // Frames are separated by a blank line; the trailing fragment is whatever
    // has not been terminated yet, so it stays in the buffer for the next read.
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const match = chunk.match(/^data:\s*(.*)$/m);
      if (!match) continue;
      /*
       * Parse and dispatch are separated on purpose.
       *
       * Tolerating a malformed frame is right — one unreadable line is not
       * worth aborting a minute-long run over. But the guard used to wrap the
       * onEvent call too, so anything the handler threw was caught here and
       * logged as a parse failure. The scan screen's handler throws
       * deliberately on a `pipeline_error` event, which is the server telling
       * the client the run has failed; that throw was swallowed, the loop ran
       * on to a clean close, and the player was shown "The pipeline finished
       * without producing a sprite" instead of the reason the server gave.
       */
      let event: PipelineEvent;
      try {
        event = JSON.parse(match[1]) as PipelineEvent;
      } catch {
        console.warn('Failed to parse SSE event:', chunk);
        continue;
      }
      onEvent(event);
    }
  }
}
