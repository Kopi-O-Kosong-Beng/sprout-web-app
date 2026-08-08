import { fireEvent, render, screen, within } from '@testing-library/react';
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
      ok: true,
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
  // Returned so a test can carry on interacting — the naming flow answers a
  // dialog after the run stops.
  return user;
}

function validFile() {
  return new File(['fake-jpeg'], 'plant.jpg', { type: 'image/jpeg' });
}

function oversizedFile() {
  const file = new File(['x'], 'plant.jpg', { type: 'image/jpeg' });
  // Real 5MB+ fixture bytes aren't needed — only the reported size matters to
  // validateUploadFile, and `size` is otherwise read-only on a File.
  Object.defineProperty(file, 'size', { value: 6_000_000 });
  return file;
}

/** Renders the page and opens the Upload dialog — the entry point every
 *  upload test drives, the same way startScan() drives the Test button. */
async function openUploadDialog() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ToastProvider>
        <ScanPage />
      </ToastProvider>
    </MemoryRouter>
  );
  await user.click(screen.getByRole('button', { name: /^upload$/i }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

/** The dropzone is the dashed-border div wrapping "Drag a photo here" — same
 *  .parentElement-from-text idiom used above to reach the ResultDialog's
 *  backdrop. */
function dropzoneFor(dialog: HTMLElement) {
  return within(dialog).getByText(/drag a photo here/i).parentElement!;
}

function fileInputFor(dialog: HTMLElement) {
  return dialog.querySelector('input[type="file"]') as HTMLInputElement;
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

  /**
   * NameDialog has existed since the Android port and nothing ever opened it:
   * when Plant.id could not identify the photo, the server substituted
   * "Unknown Plant Species" and carried on, spending a render on a name nobody
   * chose. It asks now, and the answer comes back as the run's customName.
   */
  it('asks the player to name a plant it could not identify', async () => {
    scriptStream([
      { event: 'step_start', step: '1' },
      { event: 'needs_name', step: '1', error: 'Not identified as a plant.' },
    ]);
    await startScan();

    expect(await screen.findByText(/name this plant/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn't identify it automatically/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  /**
   * The shared Overlay focuses its own panel on mount for every dialog it
   * wraps — but NameDialog's <input autoFocus> already claims focus during
   * React's synchronous commit, before that effect runs. An unguarded
   * Overlay would yank focus back onto the panel div a tick later; this
   * pins the input as the one that actually ends up focused.
   */
  it('keeps the name input focused, not the dialog panel', async () => {
    scriptStream([
      { event: 'step_start', step: '1' },
      { event: 'needs_name', step: '1', error: 'Not identified as a plant.' },
    ]);
    await startScan();

    expect(await screen.findByPlaceholderText(/rose, sunflower/i)).toHaveFocus();
  });

  it('re-runs with the name the player typed', async () => {
    scriptStream([
      { event: 'step_start', step: '1' },
      { event: 'needs_name', step: '1', error: 'Not identified as a plant.' },
    ]);
    const user = await startScan();

    await user.type(await screen.findByPlaceholderText(/rose, sunflower/i), 'Mystery Fern');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    // The name travels as customName on the second run — the path the server's
    // override branch already honoured.
    expect(streamPipeline).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ customName: 'Mystery Fern' }),
      expect.any(Function),
      expect.anything()
    );
  });

  /**
   * The result dialog covers the screen, and its only exits used to be "Scan
   * another" and the page's Back button behind the scrim. Pressing outside a box
   * is how a modal is closed everywhere else, and a plant that just saved is
   * worth being able to go and look at.
   */
  describe('leaving the result dialog', () => {
    it('closes on a press outside the panel, staying on the scan screen', async () => {
      scriptStream([completeEvent()]);
      const user = await startScan();

      const dialog = await screen.findByRole('dialog');
      await user.click(dialog.parentElement!);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays open when the press lands on the panel itself', async () => {
      scriptStream([completeEvent()]);
      const user = await startScan();

      const dialog = await screen.findByRole('dialog');
      // Any element inside the panel proves the point; the heading is matched
      // by role rather than by its wording so a copy change to the result
      // screen doesn't fail a test about dismissal.
      await user.click(within(dialog).getByRole('heading', { level: 2 }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
      scriptStream([completeEvent()]);
      const user = await startScan();

      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('offers the archive once the plant is saved', async () => {
      scriptStream([completeEvent({ saved: true })]);
      await startScan();

      expect(
        await screen.findByRole('button', { name: /see it in your archive/i })
      ).toBeInTheDocument();
    });

    it('does not offer the archive for a plant that failed to save', async () => {
      scriptStream([completeEvent({ saved: false })]);
      await startScan();

      // Sending someone to admire a record that does not exist is a worse
      // answer than the failure message beside it.
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /see it in your archive/i })
      ).not.toBeInTheDocument();
    });
  });
});

describe('ScanPage upload dialog', () => {
  beforeEach(() => {
    streamPipeline.mockReset();
    stubDemoImageLoading();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a dropped file of the wrong type', async () => {
    const { dialog } = await openUploadDialog();

    fireEvent.drop(dropzoneFor(dialog), {
      dataTransfer: { files: [new File(['x'], 'plant.gif', { type: 'image/gif' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG, or WEBP/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(streamPipeline).not.toHaveBeenCalled();
  });

  it('rejects a browsed file that is too large', async () => {
    const { dialog } = await openUploadDialog();

    fireEvent.change(fileInputFor(dialog), { target: { files: [oversizedFile()] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(streamPipeline).not.toHaveBeenCalled();
  });

  /**
   * The bug this replaces: onDragLeave fired on every boundary crossing,
   * including into a child of the dropzone (its own text/button) — so the
   * highlight flickered off and back on while dragging a file over them, and
   * onDragOver re-asserting the highlight on every repeated fire made it
   * worse. A drag-depth counter fixes both: entering/leaving a nested child
   * no longer nets out to "left the zone", and onDragOver no longer touches
   * the highlight at all.
   */
  it('keeps the dropzone highlighted while crossing into and out of its own children', async () => {
    const { dialog } = await openUploadDialog();
    const zone = dropzoneFor(dialog);
    const child = within(dialog).getByText(/drag a photo here/i);
    const highlighted = () => zone.className.includes('border-[color:var(--color-brand)]');

    fireEvent.dragEnter(zone);
    expect(highlighted()).toBe(true);

    // Repeated dragover while hovering must not be what's carrying the
    // highlight — enter/leave alone should own it now.
    fireEvent.dragOver(zone);
    fireEvent.dragOver(zone);
    expect(highlighted()).toBe(true);

    // Crossing onto a child bubbles a second dragenter up to the zone —
    // nesting one level deeper, not leaving.
    fireEvent.dragEnter(child);
    expect(highlighted()).toBe(true);

    // Leaving the child alone must not zero out the count.
    fireEvent.dragLeave(child);
    expect(highlighted()).toBe(true);

    // Only leaving the outer zone itself clears it.
    fireEvent.dragLeave(zone);
    expect(highlighted()).toBe(false);
  });

  it('accepts a valid dropped file and runs it as a web upload', async () => {
    scriptStream([completeEvent()]);
    const { dialog } = await openUploadDialog();

    fireEvent.drop(dropzoneFor(dialog), { dataTransfer: { files: [validFile()] } });

    expect(await screen.findByText(/web upload/i)).toBeInTheDocument();
    expect(streamPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ source: 'web' }),
      expect.any(Function),
      expect.anything()
    );
  });

  it('accepts a valid browsed file and runs it as a web upload', async () => {
    scriptStream([completeEvent()]);
    const { dialog } = await openUploadDialog();

    fireEvent.change(fileInputFor(dialog), { target: { files: [validFile()] } });

    expect(await screen.findByText(/web upload/i)).toBeInTheDocument();
    expect(streamPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ source: 'web' }),
      expect.any(Function),
      expect.anything()
    );
  });

  describe('dismissing the upload dialog', () => {
    it('closes on a press outside the panel', async () => {
      const { user, dialog } = await openUploadDialog();

      await user.click(dialog.parentElement!);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays open when the press lands on the panel itself', async () => {
      const { user, dialog } = await openUploadDialog();

      await user.click(within(dialog).getByText(/drag a photo here/i));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
      const { user } = await openUploadDialog();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on Cancel', async () => {
      const { user, dialog } = await openUploadDialog();

      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});


/*
 * The scan screen used to print the server's own `details` line under each
 * step. That is right for the studio's Live Scanner, which is a pipeline
 * console, and wrong for a player: it disclosed the vendor list ("via Plant.id
 * API v3", "NVIDIA Flux.2 Klein 4B", "via withoutBG"), the exact model id,
 * implementation detail ("nearest-neighbor", "Spica72 palette"), and on hop 2a
 * the ENTIRE crafted prompt, verbatim — the pipeline's own IP, shown to anyone
 * who scanned a leaf.
 *
 * These tests exist so it cannot come back by someone "helpfully" restoring
 * the detail passthrough.
 */
describe('scan progress copy', () => {
  // The Test button reaches the pipeline through fetch + createImageBitmap +
  // canvas, none of which jsdom has. Same plumbing every other test here uses.
  beforeEach(() => stubDemoImageLoading());

  const HOPS = ['1', '2a', '2b', '2c', '2d', '3', '4'];

  /* Emits the events and then never resolves, so the run stays in flight and
     the progress screen stays mounted. scriptStream() returns immediately,
     which tears the progress UI down before anything can be asserted — and
     would make the leak check below pass by rendering nothing at all. */
  function scriptStreamPending(events: PipelineEvent[]) {
    streamPipeline.mockImplementation(
      async (_p: string, _b: unknown, onEvent: (e: PipelineEvent) => void) => {
        for (const event of events) onEvent(event);
        await new Promise(() => {});
      }
    );
  }

  /** The real strings the server sends, which must never reach the screen. */
  const SERVER_DETAILS: Record<string, string> = {
    '1': 'Analyzing plant features via Plant.id API v3...',
    '2a': 'Used Tier: GEMINI — Prompt: "a pixel-art fern, Spica72 palette, 192x192"',
    '2b': 'Rendering via NVIDIA Flux.2 Klein 4B...',
    '2c': 'Extracting foreground alpha channel via withoutBG...',
    '2d': 'Resizing to 192x192 (nearest-neighbor) & snapping to Spica72 palette...',
    '3': 'Creating stats (HP=100, speed, taxonomy moves)...',
    '4': 'Running palette/dimension checks & Gemini VLM cute judge...',
  };

  it('never shows the server pipeline detail to the player', async () => {
    scriptStreamPending(
      HOPS.map((step) => ({
        event: 'step_start',
        step,
        title: `hop ${step}`,
        details: SERVER_DETAILS[step],
      })) as PipelineEvent[]
    );

    await startScan();

    const body = document.body.textContent ?? '';
    for (const leak of [
      'Plant.id',
      'NVIDIA',
      'Flux',
      'withoutBG',
      'Spica72',
      'nearest-neighbor',
      'GEMINI',
      'Prompt:',
      'HP=100',
      'VLM',
    ]) {
      expect(body, `"${leak}" leaked to the player`).not.toContain(leak);
    }
  });

  it('tells the player what is happening, abstractly', async () => {
    scriptStreamPending([
      { event: 'step_start', step: '2b', title: 'x', details: SERVER_DETAILS['2b'] },
    ] as PipelineEvent[]);

    await startScan();

    expect(await screen.findByText(/Creating the sprite/i)).toBeInTheDocument();
  });

  /* The common name, not the binomial: "Is your plant a chalk milkwort?" lands
     where "Polygala calcarea" does not. */
  it('asks about the plant using its common name', async () => {
    scriptStreamPending([
      {
        event: 'step_done',
        step: '1',
        title: 'x',
        details: SERVER_DETAILS['1'],
        result: {
          name: 'Polygala calcarea',
          common_names: ['chalk milkwort', 'milkwort'],
        },
      },
    ] as unknown as PipelineEvent[]);

    await startScan();

    expect(await screen.findByText(/Is your plant a chalk milkwort\?/i)).toBeInTheDocument();
  });

  it('falls back to the botanical name when there is no common name', async () => {
    scriptStreamPending([
      {
        event: 'step_done',
        step: '1',
        title: 'x',
        details: SERVER_DETAILS['1'],
        result: { name: 'Papilionanthe teres', common_names: [] },
      },
    ] as unknown as PipelineEvent[]);

    await startScan();

    expect(await screen.findByText(/Is your plant a Papilionanthe teres\?/i)).toBeInTheDocument();
  });
});
