import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineEvent } from '../services/pipelineStream';
import ScanPage from './ScanPage';

const mocks = vi.hoisted(() => ({
  streamPipeline: vi.fn(),
  createAvatar: vi.fn(),
}));

vi.mock('../services/pipelineStream', () => ({
  streamPipeline: mocks.streamPipeline,
}));
vi.mock('../services/sproutApi', () => ({ createAvatar: mocks.createAvatar }));

const SPRITE_B64 = 'iVBORw0KGgo=';
const SPRITE_DATA_URL = `data:image/png;base64,${SPRITE_B64}`;
/** What the stubbed canvas returns for both the pipeline and archive copies. */
const PHOTO_DATA_URL = 'data:image/jpeg;base64,photo';

/** The events a successful run delivers, in the order the pipeline sends them. */
const COMPLETED_RUN: PipelineEvent[] = [
  {
    event: 'step_done',
    step: '1',
    result: { name: 'Monstera deliciosa' },
  } as unknown as PipelineEvent,
  {
    event: 'complete',
    finalSpriteB64: SPRITE_B64,
    finalPlant: {
      name: 'Monstera deliciosa',
      taxonomy: { Kingdom: 'Plantae', Family: 'Araceae' },
      common_names: ['Swiss cheese plant'],
      description: 'A climbing aroid.',
      probability: 0.91,
    },
  } as unknown as PipelineEvent,
];

/**
 * Runs a scan and waits for the result dialog.
 *
 * `via: 'upload'` takes the "Test" button, which fetches the bundled photo —
 * a file off disk, so a web upload. `via: 'camera'` fires the hidden
 * capture="environment" input, which is the path the capture ring falls back to
 * when getUserMedia is unavailable, as it is in jsdom. Fetch, createImageBitmap
 * and the canvas are all stubbed, since jsdom implements none of them.
 */
async function runScan(
  via: 'upload' | 'camera' = 'upload',
  events: PipelineEvent[] = COMPLETED_RUN
): Promise<void> {
  mocks.streamPipeline.mockImplementation(
    async (
      _url: string,
      _body: unknown,
      onEvent: (event: PipelineEvent) => void
    ) => {
      events.forEach(onEvent);
    }
  );

  render(
    <MemoryRouter>
      <ScanPage />
    </MemoryRouter>
  );

  if (via === 'upload') {
    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
  } else {
    const cameraInput = document.querySelector('input[capture="environment"]');
    fireEvent.change(cameraInput!, {
      target: { files: [new File(['photo'], 'plant.jpg', { type: 'image/jpeg' })] },
    });
  }
  await screen.findByText('Done!');
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob())));
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }))
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,photo'
  );
  // getUserMedia is absent in jsdom, which is the "no live preview" path.
  mocks.createAvatar.mockReset();
});

describe('scan result dialog', () => {
  it('saves the finished sprite and identification to the archive', async () => {
    mocks.createAvatar.mockResolvedValue({ id: 'created-1' });
    await runScan('camera');

    expect(screen.getByText('IRL Scan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save to archive' }));

    await waitFor(() => expect(mocks.createAvatar).toHaveBeenCalledTimes(1));
    expect(mocks.createAvatar).toHaveBeenCalledWith({
      speciesName: 'Monstera deliciosa',
      speciesFamily: 'Araceae',
      spriteDataUrl: SPRITE_DATA_URL,
      photoDataUrl: PHOTO_DATA_URL,
      source: 'mobile',
      metadata: {
        taxonomy: { Kingdom: 'Plantae', Family: 'Araceae' },
        commonNames: ['Swiss cheese plant'],
        description: 'A climbing aroid.',
        confidence: 0.91,
      },
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved to your archive.'
    );
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute(
      'href',
      '/archive'
    );
    expect(
      screen.queryByRole('button', { name: 'Save to archive' })
    ).not.toBeInTheDocument();
  });

  // A file off disk could be any picture of anything, so it is a trial run:
  // the dialog says so before the save, not after the plant vanishes.
  it('saves a picked file as an expiring web upload', async () => {
    mocks.createAvatar.mockResolvedValue({ id: 'created-2' });
    await runScan('upload');

    expect(screen.getByText('Web Upload')).toBeInTheDocument();
    expect(
      screen.getByText(/expires 24 hours after you save it/i)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save to archive' }));

    await waitFor(() => expect(mocks.createAvatar).toHaveBeenCalledTimes(1));
    expect(mocks.createAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'web' })
    );
  });

  it('reports a failed save and leaves the button available to retry', async () => {
    mocks.createAvatar.mockRejectedValue(new Error('Firestore is unavailable.'));
    await runScan();

    await userEvent.click(screen.getByRole('button', { name: 'Save to archive' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Firestore is unavailable.'
    );
    expect(
      screen.getByRole('button', { name: 'Save to archive' })
    ).toBeEnabled();
  });

  // The download is what "Save sprite" used to be, and on its own it is why a
  // scanned plant never reached the archive. It stays, as the secondary action.
  it('still offers the sprite as a download', async () => {
    await runScan();

    const download = screen.getByRole('link', { name: 'Download sprite' });
    expect(download).toHaveAttribute('href', SPRITE_DATA_URL);
    expect(download).toHaveAttribute('download', 'monstera-deliciosa.png');
    expect(mocks.createAvatar).not.toHaveBeenCalled();
  });
});
