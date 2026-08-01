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
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw new Error(`Pipeline API HTTP ${response.status}`);

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
      try {
        onEvent(JSON.parse(match[1]) as PipelineEvent);
      } catch {
        // A malformed frame is not worth aborting a minute-long run over.
        console.warn('Failed to parse SSE event:', chunk);
      }
    }
  }
}
