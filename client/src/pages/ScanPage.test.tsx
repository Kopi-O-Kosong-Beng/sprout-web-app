import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineEvent } from '../services/pipelineStream';
import ScanPage from './ScanPage';

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

function completeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    event: 'complete',
    finalPlant: { name: 'Fern' },
    finalSpriteB64: 'AAAA',
    totalTimeMs: 1200,
    avatarId: 'avatar-1',
    saved: true,
    discovery: {
      firstDiscoveredByName: 'Justin',
      firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
      discoveryCount: 3,
      isFirstDiscoverer: false,
    },
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
    expect(screen.getByText(/found by 3 explorers/i)).toBeInTheDocument();
  });

  it('calls out the caller when they discovered it first', async () => {
    scriptStream([
      completeEvent({
        discovery: {
          firstDiscoveredByName: 'Zhi Feng',
          firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
          discoveryCount: 1,
          isFirstDiscoverer: true,
        },
      } as Partial<PipelineEvent>),
    ]);
    await startScan();

    expect(await screen.findByText(/you discovered this first/i)).toBeInTheDocument();
  });

  it('tells the user when the scan could not be saved', async () => {
    scriptStream([
      completeEvent({ saved: false, avatarId: null, saveError: 'bucket unreachable' } as Partial<PipelineEvent>),
    ]);
    await startScan();

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/bucket unreachable/i)).toBeInTheDocument();
  });

  it('asks the user to sign in when the server rejects the request', async () => {
    streamPipeline.mockRejectedValue(new Error('Pipeline API HTTP 401'));
    await startScan();

    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pipeline API HTTP 401/i)).not.toBeInTheDocument();
  });
});
