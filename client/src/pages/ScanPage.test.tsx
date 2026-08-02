import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineEvent } from '../services/pipelineStream';
import ScanPage, { type ScanDiscovery } from './ScanPage';

const streamPipeline = vi.hoisted(() => vi.fn());
vi.mock('../services/pipelineStream', () => ({ streamPipeline }));

/** Drives the page's own onEvent callback with a scripted event sequence. */
function scriptStream(events: PipelineEvent[]) {
  streamPipeline.mockImplementation(
    async (_path: string, _body: unknown, onEvent: (event: PipelineEvent) => void) => {
      for (const event of events) onEvent(event);
    }
  );
}

/**
 * The `complete` frame as the server actually writes it.
 *
 * This fixture once carried a discovery block the server had never sent: the
 * route put the raw dex record on the wire (`firstDiscoveredBy`, a UID) while
 * this file asserted against the resolved shape, so both discovery tests passed
 * green against a payload that did not exist. Two anchors now hold the fixture
 * to reality, one at each end:
 *
 *  - `discovery` is typed as ScanDiscovery, the interface the page itself
 *    reads, so a field that drifts from the consumer is a typecheck failure
 *    here rather than a silent pass;
 *  - server/tests/pipeline-complete-event.test.ts asserts the emitted frame
 *    carries firstDiscoveredByName/isFirstDiscoverer and no firstDiscoveredBy,
 *    which is the only place a *server-side* regression can be caught — a
 *    client test driving a mocked stream cannot see the server at all.
 */
const DISCOVERY: ScanDiscovery = {
  firstDiscoveredByName: 'Justin',
  firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
  discoveryCount: 3,
  isFirstDiscoverer: false,
};

function completeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    event: 'complete',
    finalPlant: { name: 'Fern' },
    finalSpriteB64: 'AAAA',
    totalTimeMs: 1200,
    avatarId: 'avatar-1',
    saved: true,
    discovery: DISCOVERY,
    ...overrides,
  } as PipelineEvent;
}

/**
 * The page's real scan trigger is the "Test" button (onTestImage), which —
 * before it ever touches the pipeline — fetches a demo JPEG and runs it
 * through createImageBitmap + canvas to build a data URL. None of those
 * browser APIs exist in jsdom, so they're stubbed here purely as plumbing to
 * reach the (mocked) pipeline call; the pipeline itself is driven entirely by
 * the `streamPipeline` mock, never by mocking `fetch` for the pipeline call.
 */
function stubDemoImageLoading() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['fake-jpeg'], { type: 'image/jpeg' })),
    })
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() })
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,ZmFrZQ=='
  );
}

/** Triggers the page's own scan entry point: the "Test" button. */
async function startScan() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ScanPage />
    </MemoryRouter>
  );
  const trigger = await screen.findByRole('button', { name: /^test$/i });
  await user.click(trigger);
}

describe('ScanPage save outcome', () => {
  beforeEach(() => {
    streamPipeline.mockReset();
    stubDemoImageLoading();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows who first discovered the species', async () => {
    scriptStream([completeEvent()]);
    await startScan();

    expect(await screen.findByText(/Justin/)).toBeInTheDocument();
    // The dex counts scans, not scanners (repeat scans by one user included),
    // so the label must not claim a number of people.
    expect(screen.getByText(/scanned 3 times/i)).toBeInTheDocument();
    expect(screen.queryByText(/explorers/i)).not.toBeInTheDocument();
  });

  it('calls out the caller when they discovered it first', async () => {
    const discovery: ScanDiscovery = {
      firstDiscoveredByName: 'Zhi Feng',
      firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
      discoveryCount: 1,
      isFirstDiscoverer: true,
    };
    scriptStream([completeEvent({ discovery } as Partial<PipelineEvent>)]);
    await startScan();

    expect(await screen.findByText(/you discovered this first/i)).toBeInTheDocument();
  });

  it('tells the user when the scan could not be saved', async () => {
    // The server maps every save fault onto this fixed line. Raw Firestore and
    // Cloud Storage messages name the bucket, project and service account, so
    // they must never reach the dialog.
    scriptStream([
      completeEvent({
        saved: false,
        avatarId: null,
        saveError: 'Please try scanning it again.',
      } as Partial<PipelineEvent>),
    ]);
    await startScan();

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/please try scanning it again/i)).toBeInTheDocument();
  });

  it('asks the user to sign in when the server rejects the request', async () => {
    streamPipeline.mockRejectedValue(new Error('Pipeline API HTTP 401'));
    await startScan();

    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pipeline API HTTP 401/i)).not.toBeInTheDocument();
  });
});
