import request from 'supertest';
import { resolveTrustProxy } from '../app';
import app from '../app';

describe('trust proxy configuration', () => {
  it('trusts exactly one proxy hop in production by default', () => {
    expect(resolveTrustProxy('production', undefined)).toBe(1);
    expect(resolveTrustProxy('test', undefined)).toBe(false);
  });

  it('accepts a bounded positive hop override and rejects unsafe values', () => {
    expect(resolveTrustProxy('production', '2')).toBe(2);
    expect(resolveTrustProxy('production', '0')).toBe(1);
    expect(resolveTrustProxy('production', 'true')).toBe(1);
    expect(resolveTrustProxy('production', '20')).toBe(1);
  });

  it('allows the standard Vite origin when another local frontend origin is configured', async () => {
    const response = await request(app)
      .options('/api/auth/signup')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173'
    );
  });
});

/** Routes migrated from Sprout_Dev_Platform.
 *
 *  There they were served from the same origin as the SPA with no credentials
 *  at all. The two things worth pinning here are that they are mounted where the
 *  client now expects them, and that neither is reachable anonymously —
 *  /config-status enumerates which provider keys exist and /run-tests spawns a
 *  process, so an unauthenticated 200 from either would be the bug.
 */
describe('migrated pipeline and platform routes', () => {
  it('keeps the pre-existing health check unauthenticated', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('mounts the sprite pipeline behind authentication', async () => {
    const response = await request(app)
      .post('/api/pipeline/run-stream')
      .send({ imageBase64: 'data:image/jpeg;base64,AAAA' });

    // 401, not 404: the route exists, the caller is simply not signed in.
    expect(response.status).toBe(401);
  });

  /** The pipeline router raises the JSON limit to 20 MB for base64 photos, but a
   *  parser mounted app-wide runs first and would consume the body under its own
   *  limit. The client sends a 1024px JPEG at q0.85 — 120-230 kB of base64 for an
   *  ordinary plant photo — so a default 100 kb ceiling rejects a real scan while
   *  leaving the small fixtures above passing. Sized past that default here so
   *  the limit is asserted on the path the browser actually takes. */
  it('accepts a real-sized scan photo rather than rejecting it as too large', async () => {
    const oneMegabyte = 'A'.repeat(1024 * 1024);
    const response = await request(app)
      .post('/api/pipeline/run-stream')
      .send({ imageBase64: `data:image/jpeg;base64,${oneMegabyte}` });

    expect(response.status).not.toBe(413);
    // Reached the router's auth gate, which is as far as an anonymous call gets.
    expect(response.status).toBe(401);
  });

  it('mounts the operations portal behind authentication', async () => {
    const response = await request(app).get('/api/platform/config-status');
    expect(response.status).toBe(401);
  });

  it('does not let the portal shadow the account-management admin routes', async () => {
    // Both were called /api/admin in their source repos; only one still is.
    const response = await request(app).get('/api/admin/users');
    expect(response.status).toBe(401);
  });
});
