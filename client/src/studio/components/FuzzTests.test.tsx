import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuzzTests } from './FuzzTests';

const studioFetch = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ studioFetch }));

/** The shape platform/fuzzRunner returns. Kept close to a real payload so the
 *  rendering assertions below are about the component, not about a fixture
 *  that flatters it. */
function summary(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    startedAt: '2026-08-06T12:00:00.000Z',
    durationMs: 24_310,
    runs: 300,
    rngSeed: 42,
    deterministic: true,
    seedCorpus: ['hydrangea.jpg', 'lego_plant.jpg'],
    counts: { ok: 300, crash: 0, hang: 0, silent_bad_output: 0, skipped: 0 },
    byMutation: {
      truncate: { ok: 35 },
      pixel_noise: { ok: 38 },
    },
    findings: [],
    ...overrides,
  };
}

function respondWith(body: unknown, ok = true, status = 200) {
  studioFetch.mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

async function runFuzz() {
  await userEvent.setup().click(screen.getByRole('button', { name: /run fuzz/i }));
}

describe('FuzzTests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts empty and does not call the runner until asked', () => {
    render(<FuzzTests />);
    expect(screen.getByText(/no fuzz run yet/i)).toBeVisible();
    expect(studioFetch).not.toHaveBeenCalled();
  });

  /*
   * The reassurance has to be on screen BEFORE the button is pressed. This page
   * sits next to a pipeline that costs money per run, and an operator should
   * not have to read the source to learn which kind of fuzzing this is.
   */
  it('says up front that the run is free and offline', () => {
    render(<FuzzTests />);
    expect(screen.getByText(/no provider is called and nothing is billed/i)).toBeVisible();
  });

  it('posts the run count and reports the outcome tallies', async () => {
    respondWith(summary());
    render(<FuzzTests />);

    await runFuzz();

    await waitFor(() => expect(screen.getByText(/no findings/i)).toBeVisible());
    expect(studioFetch).toHaveBeenCalledWith(
      '/api/platform/run-fuzz',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(studioFetch.mock.calls[0][1].body);
    expect(body.runs).toBe(300);
    // Blank seed means explore, which must NOT be sent as a seed of 0.
    expect(body.rngSeed).toBeUndefined();
  });

  it('always surfaces the rng seed so a run can be reproduced', async () => {
    respondWith(summary({ rngSeed: 1234, deterministic: false }));
    render(<FuzzTests />);

    await runFuzz();

    expect(await screen.findByText(/seed 1234/i)).toBeVisible();
  });

  it('fills the replay field from a finished run', async () => {
    respondWith(summary({ rngSeed: 777 }));
    render(<FuzzTests />);
    await runFuzz();

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /replay this seed/i }));

    expect(screen.getByLabelText(/replay seed/i)).toHaveValue('777');
  });

  it('sends a typed seed so an operator can reproduce someone else’s finding', async () => {
    respondWith(summary());
    const user = userEvent.setup();
    render(<FuzzTests />);

    await user.clear(screen.getByLabelText(/mutations/i));
    await user.type(screen.getByLabelText(/mutations/i), '50');
    await user.type(screen.getByLabelText(/replay seed/i), '99');
    await runFuzz();

    const body = JSON.parse(studioFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ runs: 50, rngSeed: 99 });
  });

  /*
   * The failure path is the reason the page exists, so it gets the same
   * scrutiny as the happy one: the count, the per-finding detail, and enough
   * coordinates (mutation, seed photo, iteration) to reproduce it.
   */
  it('renders findings with the coordinates needed to reproduce them', async () => {
    respondWith(
      summary({
        ok: false,
        counts: { ok: 260, crash: 1, hang: 0, silent_bad_output: 39, skipped: 0 },
        findings: [
          {
            seed: 'melastoma.jpg',
            mutation: 'truncate',
            outcome: 'silent_bad_output',
            detail: 'hostile input was accepted: accepted jpeg 768x1024',
            iteration: 1,
          },
          {
            seed: 'hydrangea.jpg',
            mutation: 'bitflip',
            outcome: 'crash',
            detail: 'TypeError: boom',
            iteration: 7,
          },
        ],
      })
    );
    render(<FuzzTests />);

    await runFuzz();

    expect(await screen.findByText(/2 findings worth triaging/i)).toBeVisible();

    /* Scoped to the findings list: the same wording appears in the legend that
       explains what a wrong verdict IS, and an unscoped query matched both. */
    const truncated = screen.getByText(/melastoma\.jpg · iteration 1/i).closest('li')!;
    expect(within(truncated).getByText(/hostile input was accepted/i)).toBeVisible();
    expect(within(truncated).getByText(/truncate/i)).toBeVisible();

    const crashed = screen.getByText(/hydrangea\.jpg · iteration 7/i).closest('li')!;
    expect(within(crashed).getByText(/TypeError: boom/i)).toBeVisible();
  });

  it('breaks the run down per mutation strategy', async () => {
    respondWith(summary());
    render(<FuzzTests />);
    await runFuzz();

    const table = await screen.findByRole('table', {
      name: /outcome counts for each mutation strategy/i,
    });
    expect(within(table).getByText('truncate')).toBeVisible();
    expect(within(table).getByText('pixel_noise')).toBeVisible();
    // The per-strategy explanation, so the table is readable without the source.
    expect(within(table).getByText(/must be rejected/i)).toBeVisible();
  });

  it('surfaces a runner error instead of a silent no-op', async () => {
    respondWith({ error: 'A fuzz run is already in progress.' }, false, 409);
    render(<FuzzTests />);

    await runFuzz();

    expect(
      await screen.findByText(/a fuzz run is already in progress/i)
    ).toBeVisible();
  });

  it('survives the runner being unreachable', async () => {
    studioFetch.mockRejectedValue(new Error('Failed to fetch'));
    render(<FuzzTests />);

    await runFuzz();

    expect(await screen.findByText(/failed to fetch/i)).toBeVisible();
  });

  it('labels both inputs so they are reachable by name', () => {
    render(<FuzzTests />);
    // Placeholder-only fields were a real defect elsewhere in this app; these
    // carry real labels.
    expect(screen.getByLabelText(/mutations/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/replay seed/i)).toBeInTheDocument();
  });
});
