/**
 * The ingest gate, asserted at the wire rather than in isolation.
 *
 * pipeline/__tests__/imageIngest.test.ts covers what validateUploadedImage
 * decides. This covers something different and equally easy to get wrong:
 * that both pipeline entry points actually CALL it, and that a rejection stops
 * the run before any provider is contacted.
 *
 * A unit test cannot catch a route that forgets to invoke its own guard, and
 * that is exactly the state /run-stage2c was in until now — the scan leg was
 * closed while the sprite leg still went straight to Buffer.from().
 */
import request from 'supertest';

const mockAuthAdmin = { verifyIdToken: jest.fn() };

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

import app from '../app';
import { TINY_JPEG_DATA_URL } from './fixtures/tiny-image';

/** Verified caller. The pipeline router requires auth but NOT superadmin,
 *  which is the whole reason the sprite leg needed guarding. */
const AUTH = 'Bearer verified:ingest-gate-user';

/** Reads the SSE frames a run wrote. */
function frames(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data: /, '').trim())
    .filter(Boolean)
    .flatMap((json) => {
      try {
        return [JSON.parse(json)];
      } catch {
        return [];
      }
    });
}

describe('image ingest gate, at the route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
      if (!token.startsWith('verified:')) throw new Error('bad token');
      return { uid: token.slice('verified:'.length), email_verified: true };
    });
  });

  describe('POST /run-stream (the camera photo)', () => {
    it.each([
      ['prose', 'hello world!!', 'not_base64'],
      ['the old placeholder fixture', 'data:image/jpeg;base64,AAAA', 'unreadable'],
      ['an empty string', '', 'missing'],
    ])('refuses %s before any provider is called', async (_label, payload, reason) => {
      const response = await request(app)
        .post('/api/pipeline/run-stream')
        .set('Authorization', AUTH)
        .send({ imageBase64: payload });

      expect(response.status).toBe(200); // SSE: the failure rides the stream
      const sent = frames(response.text);
      const error = sent.find((f) => f.event === 'error');

      expect(error).toMatchObject({ step: '1', reason });
      // Nothing downstream ran: no identification step ever started.
      expect(sent.some((f) => f.event === 'step_start')).toBe(false);
    });
  });

  /*
   * The leg this change closes. Same guard, different vocabulary, and the run
   * must stop at 2c rather than handing bytes to sharp.
   */
  describe('POST /run-stage2c (the sprite echoed back)', () => {
    it.each([
      ['prose', 'hello world!!', 'not_base64'],
      ['a truthy non-image', 'data:image/png;base64,AAAA', 'unreadable'],
    ])('refuses %s', async (_label, payload, reason) => {
      const response = await request(app)
        .post('/api/pipeline/run-stage2c')
        .set('Authorization', AUTH)
        .send({ rawSpriteB64: payload, plantName: 'Testus planta' });

      const error = frames(response.text).find((f) => f.event === 'error');
      expect(error).toMatchObject({ step: '2c', reason });
      // Operator vocabulary, not player vocabulary — there is no photo here.
      expect(String(error!.error)).toMatch(/sprite|render/i);
      expect(String(error!.error)).not.toMatch(/taking the photo/i);
    });

    it('still accepts a real image, so the human-gate resume path works', async () => {
      const response = await request(app)
        .post('/api/pipeline/run-stage2c')
        .set('Authorization', AUTH)
        .send({ rawSpriteB64: TINY_JPEG_DATA_URL, plantName: 'Testus planta' });

      const sent = frames(response.text);
      const rejected = sent.find(
        (f) => f.event === 'error' && typeof f.reason === 'string'
      );
      // It may still fail later for unrelated reasons (no provider keys in
      // test), but it must not be refused BY THE GATE.
      expect(rejected).toBeUndefined();
    });

    it('rejects a missing payload without reaching the decoder', async () => {
      const response = await request(app)
        .post('/api/pipeline/run-stage2c')
        .set('Authorization', AUTH)
        .send({ plantName: 'Testus planta' });

      const error = frames(response.text).find((f) => f.event === 'error');
      expect(error).toBeDefined();
    });
  });
});
