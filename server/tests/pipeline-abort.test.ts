/** An abandoned scan must actually stop.
 *
 *  Until the disconnect wiring existed, POST /api/pipeline/run-stream had no
 *  close handling at all: closing the tab a second into a scan still spent
 *  every provider call and upserted the creature, so the archive changed after
 *  a scan the client had reported as "nothing happened". These tests hold the
 *  two halves of the fix at the wire: a run whose socket dies mid-hop makes no
 *  further paid calls, and — the invariant that matters — persists nothing.
 *
 *  Every stage and persistScan itself are mocked (this file is about control
 *  flow, not sprites), so no emulator is needed: the disconnect is a real TCP
 *  socket destroy against a real listening server, because destroying
 *  supertest's abstraction mid-stream is exactly the part worth testing.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const mockAuthAdmin = { verifyIdToken: jest.fn() };
const mockIdentifyPlant = jest.fn();
const mockCraftPromptTiered = jest.fn();
const mockGenerateSprite = jest.fn();
const mockRemoveBackgroundSafe = jest.fn();
const mockPersistScan = jest.fn();

jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});

jest.mock('../pipeline/stages/identify', () => {
  const actual = jest.requireActual('../pipeline/stages/identify');
  return { ...actual, identifyPlant: mockIdentifyPlant };
});

jest.mock('../pipeline/stages/promptCraft', () => ({
  craftPromptTiered: mockCraftPromptTiered,
}));

jest.mock('../pipeline/stages/generate', () => ({
  generateSprite: mockGenerateSprite,
}));

jest.mock('../pipeline/stages/removeBg', () => ({
  removeBackgroundSafe: mockRemoveBackgroundSafe,
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

jest.mock('../services/scan-persistence', () => {
  const actual = jest.requireActual('../services/scan-persistence');
  return { ...actual, persistScan: mockPersistScan };
});

import app from '../app';
import { TINY_JPEG_DATA_URL } from './fixtures/tiny-image';

const SCANNER = 'user-abandons-scan';

let previousAuthDevBypass: string | undefined;
let previousPlantApiKey: string | undefined;
let server: http.Server;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(): Promise<number> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    );
  });
}

/** Fires the scan and resolves once the stream ends (or errors, for the
 *  destroyed-socket case, where the error is the expected outcome). */
function postScan(port: number): {
  request: http.ClientRequest;
  finished: Promise<void>;
} {
  const body = JSON.stringify({
    imageBase64: TINY_JPEG_DATA_URL,
    pauseAt2b: false,
    source: 'camera',
  });
  const request = http.request({
    host: '127.0.0.1',
    port,
    path: '/api/pipeline/run-stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer verified:${SCANNER}`,
    },
  });
  const finished = new Promise<void>((resolve) => {
    request.on('response', (response) => {
      response.on('data', () => {});
      response.on('end', resolve);
      response.on('error', () => resolve());
    });
    request.on('error', () => resolve());
  });
  request.write(body);
  request.end();
  return { request, finished };
}

beforeEach(() => {
  previousAuthDevBypass = process.env.AUTH_DEV_BYPASS;
  previousPlantApiKey = process.env.PLANT_API_KEY;
  process.env.AUTH_DEV_BYPASS = 'false';
  process.env.PLANT_API_KEY = 'test-plant-key';

  jest.clearAllMocks();
  mockAuthAdmin.verifyIdToken.mockImplementation(async (token: string) => {
    const [kind, uid] = token.split(':');
    if (kind !== 'verified' || !uid) throw new Error('invalid test token');
    return { uid, email: `${uid}@example.com`, email_verified: true };
  });
  mockIdentifyPlant.mockResolvedValue({
    name: 'Fern',
    probability: 0.93,
    common_names: ['Fern'],
    taxonomy: { Kingdom: 'Plantae' },
  });
  mockCraftPromptTiered.mockResolvedValue({ prompt: 'a cute fern', tier: 'gemini' });
  mockGenerateSprite.mockResolvedValue({
    png: Buffer.from('raw-sprite'),
    model: 'test-model',
    fromModel: true,
  });
  mockRemoveBackgroundSafe.mockResolvedValue({
    png: Buffer.from('cutout'),
    removeBgOk: true,
  });
  mockPersistScan.mockResolvedValue({
    saved: true,
    avatarId: 'avatar-1',
    saveError: null,
    discovery: null,
    candidate: null,
  });
});

afterEach(async () => {
  process.env.AUTH_DEV_BYPASS = previousAuthDevBypass;
  process.env.PLANT_API_KEY = previousPlantApiKey;
  await new Promise((resolve) => server.close(resolve));
});

it('runs to persistence while the scanner stays connected (control)', async () => {
  const port = await listen();
  const { finished } = await Promise.resolve(postScan(port));
  await finished;

  expect(mockGenerateSprite).toHaveBeenCalledTimes(1);
  expect(mockPersistScan).toHaveBeenCalledTimes(1);
});

it('stops at the next hop boundary when the scanner disconnects: no render, nothing persisted', async () => {
  const port = await listen();

  // The prompt hop stalls until after the client has torn its socket down,
  // guaranteeing the disconnect lands mid-run rather than racing the stream.
  let scan: { request: http.ClientRequest; finished: Promise<void> };
  mockCraftPromptTiered.mockImplementation(async () => {
    scan.request.destroy();
    await sleep(200);
    return { prompt: 'a cute fern', tier: 'gemini' };
  });

  scan = postScan(port);
  await scan.finished;
  // The handler resolves the stalled hop, hits the next checkpoint, and bails.
  await sleep(400);

  expect(mockCraftPromptTiered).toHaveBeenCalledTimes(1);
  expect(mockGenerateSprite).not.toHaveBeenCalled();
  expect(mockPersistScan).not.toHaveBeenCalled();
});
