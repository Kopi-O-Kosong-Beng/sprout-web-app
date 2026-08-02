/** The pipeline's `complete` frame, asserted at the wire.
 *
 *  This is where the discovery-shape bug lived and where only a boundary test
 *  could have caught it: the route put `persistScan`'s raw dex record on the
 *  stream — `{ speciesKey, speciesName, firstDiscoveredBy, ... }` — while the
 *  client read `{ firstDiscoveredByName, isFirstDiscoverer, ... }`. Both sides
 *  had passing tests. Nothing tested the frame between them, so "You discovered
 *  this first!" could never render and another user's Firebase UID shipped to
 *  the browser on every scan.
 *
 *  The upstream hops are mocked: this file is about what the route emits, not
 *  about sprite rendering, and every real stage either costs a network call or
 *  seconds of sharp work. Persistence itself is real, against the emulator.
 */
import request from 'supertest';

const mockAuthAdmin = { verifyIdToken: jest.fn() };
const mockIdentifyPlant = jest.fn();
/** Species keys handed to sprite storage, in call order. */
const mockSpriteSaves: string[] = [];

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

jest.mock('../pipeline/stages/identify', () => {
  const actual = jest.requireActual('../pipeline/stages/identify');
  return { ...actual, identifyPlant: mockIdentifyPlant };
});

jest.mock('../pipeline/stages/promptCraft', () => ({
  craftPromptTiered: jest.fn().mockResolvedValue({ prompt: 'a cute fern', tier: 'gemini' }),
}));

jest.mock('../pipeline/stages/generate', () => ({
  generateSprite: jest.fn().mockResolvedValue({
    png: Buffer.from('raw-sprite'),
    model: 'test-model',
    fromModel: true,
  }),
}));

jest.mock('../pipeline/stages/removeBg', () => ({
  removeBackgroundSafe: jest
    .fn()
    .mockResolvedValue({ png: Buffer.from('cutout'), removeBgOk: true }),
}));

jest.mock('../pipeline/stages/finish', () => ({
  finishSprite: jest.fn().mockResolvedValue(Buffer.from('finished-sprite')),
  cropPhoto: jest.fn().mockResolvedValue(Buffer.from('cropped')),
}));

jest.mock('../pipeline/eval/programmatic', () => ({
  programmaticEval: jest.fn().mockResolvedValue({}),
}));

jest.mock('../pipeline/eval/judge', () => ({
  geminiJudgeEval: jest.fn().mockResolvedValue({}),
}));

jest.mock('../services/sprite-storage', () => ({
  __esModule: true,
  default: () => ({
    save: async (speciesKey: string) => {
      mockSpriteSaves.push(speciesKey);
      return `https://cdn.test/${speciesKey}.png`;
    },
  }),
}));

import app from '../app';
import dexRepository from '../repositories/dex';
import { clearFirestore, seedFirestoreUser } from './firestore-test-utils';

const SCANNER = 'user-scanner';
const FINDER = 'user-finder';

let previousAuthDevBypass: string | undefined;
let previousPlantApiKey: string | undefined;

interface PipelineFrame {
  event: string;
  [key: string]: unknown;
}

/** Runs a full scan and returns the SSE frames it wrote, plus the raw body. */
async function runScan(
  uid: string,
  body: Record<string, unknown> = {}
): Promise<{ frames: PipelineFrame[]; raw: string }> {
  const response = await request(app)
    .post('/api/pipeline/run-stream')
    .set('Authorization', `Bearer verified:${uid}`)
    .send({ imageBase64: 'data:image/jpeg;base64,AAAA', pauseAt2b: false, ...body });

  expect(response.status).toBe(200);
  const frames = response.text
    .split('\n\n')
    .map((chunk) => chunk.match(/^data:\s*(.*)$/m))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => JSON.parse(match[1]) as PipelineFrame);

  return { frames, raw: response.text };
}

function completeFrame(frames: PipelineFrame[]): PipelineFrame {
  const frame = frames.find((candidate) => candidate.event === 'complete');
  expect(frame).toBeDefined();
  return frame!;
}

beforeEach(async () => {
  previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
  previousPlantApiKey = process.env.PLANT_API_KEY;
  process.env.AUTH_DEV_BYPASS = 'false';
  // A configured key is what makes identifyPlant's answer a real one; without
  // it the route treats every identification as the keyless mock (see below).
  process.env.PLANT_API_KEY = 'test-plant-key';

  mockAuthAdmin.verifyIdToken.mockReset();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    const [kind, uid] = token.split(':');
    if (kind !== 'verified' || !uid) throw new Error('invalid test token');
    return { uid, email: `${uid}@example.com`, email_verified: true };
  });

  mockIdentifyPlant.mockReset();
  mockIdentifyPlant.mockResolvedValue({
    name: 'Fern',
    probability: 0.93,
    common_names: ['fern'],
    taxonomy: { kingdom: 'Plantae', family: 'Polypodiaceae' },
  });

  mockSpriteSaves.length = 0;
  await clearFirestore();
});

afterEach(() => {
  if (previousAuthDevBypass === undefined) delete process.env.AUTH_DEV_BYPASS;
  else process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
  if (previousPlantApiKey === undefined) delete process.env.PLANT_API_KEY;
  else process.env.PLANT_API_KEY = previousPlantApiKey;
});

describe('pipeline complete event discovery block', () => {
  it('emits the resolved discoverer name and never the raw UID', async () => {
    await seedFirestoreUser({
      id: FINDER,
      email: 'finder@example.test',
      displayName: 'Justin',
      isVerified: true,
    });
    await dexRepository.recordDiscovery('fern', FINDER, 'Fern');

    const { frames, raw } = await runScan(SCANNER);
    const complete = completeFrame(frames);

    expect(complete.saved).toBe(true);
    expect(complete.discovery).toEqual({
      firstDiscoveredByName: 'Justin',
      firstDiscoveredAt: expect.any(String),
      discoveryCount: 2,
      isFirstDiscoverer: false,
    });
    // The three fields the old wire shape carried, none of which any client
    // reads, and one of which is another account's identifier.
    expect(complete.discovery).not.toHaveProperty('firstDiscoveredBy');
    expect(complete.discovery).not.toHaveProperty('speciesKey');
    expect(raw).not.toContain(FINDER);
    expect(raw).not.toContain('finder@example.test');
  });

  it('marks the scanner when they are the first discoverer', async () => {
    await seedFirestoreUser({
      id: SCANNER,
      email: 'scanner@example.test',
      displayName: 'Zhi Feng',
      isVerified: true,
    });

    const { frames } = await runScan(SCANNER);
    const discovery = completeFrame(frames).discovery as Record<string, unknown>;

    expect(discovery.isFirstDiscoverer).toBe(true);
    expect(discovery.firstDiscoveredByName).toBe('Zhi Feng');
  });

  it('emits discovery: null rather than failing when the profile is missing', async () => {
    const { frames } = await runScan(SCANNER);
    const complete = completeFrame(frames);

    expect(complete.saved).toBe(true);
    expect(complete.avatarId).toBeTruthy();
    expect(complete.discovery).toBeNull();
  });
});
