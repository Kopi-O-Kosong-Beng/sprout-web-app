import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDevSession: vi.fn(),
  getIdToken: vi.fn(),
  isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock('../../services/devSession', () => ({
  getDevSession: mocks.getDevSession,
}));

vi.mock('../../services/firebaseClient', () => ({
  isFirebaseConfigured: mocks.isFirebaseConfigured,
  getSproutFirebaseAuth: () => ({
    currentUser: { getIdToken: mocks.getIdToken },
  }),
}));

vi.mock('../../services/pipelineStream', () => ({
  apiUrl: (path: string) => `http://api.test${path}`,
}));

import { studioFetch } from './api';

/** The headers the wrapper actually put on the wire. */
function sentHeaders(): Headers {
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return init.headers as Headers;
}

describe('studioFetch credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFirebaseConfigured.mockReturnValue(true);
    globalThis.fetch = vi.fn(async () => new Response('{}')) as never;
  });

  /*
   * The regression this exists for. apiClient's interceptor identifies a local
   * dev session with x-dev-uid / x-dev-email, because such a session has no
   * Firebase user and therefore no ID token. studioFetch is a second
   * implementation of the same job and never learned that, so every studio
   * call under a dev login went out with no credential and came back 401 —
   * while the surrounding app looked signed in, because the nav reads a
   * different source.
   */
  it('identifies a dev session the way apiClient does', async () => {
    mocks.getDevSession.mockReturnValue({
      uid: 'dev-admin',
      email: 'test@sprout.com',
    });

    await studioFetch('/api/platform/run-fuzz', { method: 'POST' });

    const headers = sentHeaders();
    expect(headers.get('x-dev-uid')).toBe('dev-admin');
    expect(headers.get('x-dev-email')).toBe('test@sprout.com');
    // No token exists for a dev session, so none should be requested.
    expect(mocks.getIdToken).not.toHaveBeenCalled();
    expect(headers.get('Authorization')).toBeNull();
  });

  it('sends a Firebase token when there is a real session', async () => {
    mocks.getDevSession.mockReturnValue(null);
    mocks.getIdToken.mockResolvedValue('a-real-token');

    await studioFetch('/api/platform/run-fuzz', { method: 'POST' });

    const headers = sentHeaders();
    expect(headers.get('Authorization')).toBe('Bearer a-real-token');
    // The bypass headers must never ride along with a real session.
    expect(headers.get('x-dev-uid')).toBeNull();
  });

  it('sends no credential at all when there is neither', async () => {
    mocks.getDevSession.mockReturnValue(null);
    mocks.isFirebaseConfigured.mockReturnValue(false);

    await studioFetch('/api/platform/health');

    const headers = sentHeaders();
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('x-dev-uid')).toBeNull();
  });

  it('keeps the JSON content type and any caller-supplied headers', async () => {
    mocks.getDevSession.mockReturnValue(null);
    mocks.getIdToken.mockResolvedValue('t');

    await studioFetch('/api/platform/run-fuzz', {
      method: 'POST',
      headers: { 'X-Custom': 'kept' },
    });

    const headers = sentHeaders();
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom')).toBe('kept');
  });
});
