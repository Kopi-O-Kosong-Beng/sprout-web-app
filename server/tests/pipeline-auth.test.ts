/** The pipeline routes' auth guard. `app-config.test.ts:46-70` already covers the
 *  no-credentials cases (missing header -> 401, including for an oversized body);
 *  this file covers the case those do not: a caller that presents a bearer token
 *  the Firebase Admin SDK cannot verify must be rejected, not treated as anonymous
 *  and not allowed to start generation work. */
import request from 'supertest';
import app from '../app';

describe('pipeline route authentication', () => {
  it('rejects a malformed bearer token', async () => {
    const response = await request(app)
      .post('/api/pipeline/run-stream')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ imageBase64: 'AAAA' });

    expect(response.status).toBe(401);
  });
});
