import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/common/Toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PipelineRequestError,
  type PipelineEvent,
} from '../services/pipelineStream';
import ScanPage, { type ScanDiscovery } from './ScanPage';

const streamPipeline = vi.hoisted(() => vi.fn());
// Partial mock: PipelineRequestError is a real class the page branches on, so
// it must be the genuine one, not a stub.
vi.mock('../services/pipelineStream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/pipelineStream')>()),
  streamPipeline,
}));

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
      <ToastProvider>
        <ScanPage />
      </ToastProvider>
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
    streamPipeline.mockRejectedValue(
      new PipelineRequestError('unauthorised', 'Pipeline API HTTP 401', 401)
    );
    await startScan();

    // Surfaced as a toast — the only place a scan failure appears now.
    expect(await screen.findByText(/sign in to scan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pipeline API HTTP 401/i)).not.toBeInTheDocument();
  });

  /**
   * The bug this replaces: the page decided by `message.includes('401')`, so an
   * offline device — whose Firebase token refresh fails before any request is
   * sent — was told to sign in, the one thing that could not help.
   */
  it('tells an offline user to reconnect, not to sign in', async () => {
    streamPipeline.mockRejectedValue(
      new PipelineRequestError('offline', 'No connection.')
    );
    await startScan();

    expect(await screen.findByText(/reconnect to wifi/i)).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    // Offline is the one the player can fix, so the toast carries the way out.
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('does not mistake an unrelated error mentioning 401 for a sign-in problem', async () => {
    streamPipeline.mockRejectedValue(
      new PipelineRequestError('http', 'Render failed after 401 ms', 500)
    );
    await startScan();

    expect(await screen.findByText(/Render failed after 401 ms/i)).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  /** Too unsure to be worth a render: ask for a better photo, do not invent a
   *  creature from a guess. */
  it('asks for a clearer photo when identification is not confident enough', async () => {
    scriptStream([
      {
        event: 'low_confidence',
        name: 'Ficus lyrata',
        probability: 0.31,
        threshold: 0.7,
      },
    ]);
    await startScan();

    expect(await screen.findByText(/not sure about this one/i)).toBeInTheDocument();
    expect(screen.getByText(/Ficus lyrata/)).toBeInTheDocument();
    expect(screen.getByText(/31%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan again/i })).toBeInTheDocument();
  });

  /**
   * The reader used to wrap the onEvent call in its malformed-frame guard, so
   * the deliberate throw on a pipeline_error was caught and logged as a parse
   * failure. The run then closed cleanly and the player was told the pipeline
   * "finished without producing a sprite" — hiding the reason the server gave.
   */
  it('surfaces the reason the server gave for a failed run', async () => {
    scriptStream([
      { event: 'step_start', step: '1' },
      { event: 'pipeline_error', error: 'The image model refused the prompt.' },
    ]);
    await startScan();

    expect(
      await screen.findByText(/The image model refused the prompt\./i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/finished without producing a sprite/i)
    ).not.toBeInTheDocument();
  });

  /** A run the player cancelled is not a failure, so it must not be reported
   *  to them as one. */
  it('says nothing when the player cancels the run', async () => {
    streamPipeline.mockRejectedValue(
      Object.assign(new DOMException('Aborted', 'AbortError'))
    );
    await startScan();

    expect(screen.queryByText(/no connection/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
