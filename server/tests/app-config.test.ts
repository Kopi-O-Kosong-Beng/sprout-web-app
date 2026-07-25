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
