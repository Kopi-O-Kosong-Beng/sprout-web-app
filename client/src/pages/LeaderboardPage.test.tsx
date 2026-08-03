import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Leaderboards } from '../services/sproutApi';
import LeaderboardPage from './LeaderboardPage';

const apiMocks = vi.hoisted(() => ({
  getLeaderboards: vi.fn(),
}));

vi.mock('../services/sproutApi', () => apiMocks);

function boards(overrides: Partial<Leaderboards> = {}): Leaderboards {
  return {
    xp: {
      entries: [
        {
          rank: 1,
          displayName: 'Ada',
          xp: 140,
          wins: 7,
          losses: 1,
          bestWinStreak: 5,
          isCaller: false,
        },
        {
          rank: 2,
          displayName: 'Bram',
          xp: 65,
          wins: 3,
          losses: 2,
          bestWinStreak: 2,
          isCaller: true,
        },
      ],
      caller: {
        rank: 2,
        displayName: 'Bram',
        xp: 65,
        wins: 3,
        losses: 2,
        bestWinStreak: 2,
      },
      totalPlayers: 2,
    },
    discovery: {
      entries: [
        { rank: 1, displayName: 'Ada', discoveries: 3, isCaller: false },
      ],
      caller: { rank: null, displayName: 'Bram', discoveries: 0 },
      totalPlayers: 1,
    },
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/leaderboard']}>
      <Routes>
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/battle" element={<h1>Battle page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists players in the order the server ranked them', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(boards());
    renderPage();

    const ranking = await screen.findByRole('list', { name: /experience ranking/i });
    const names = within(ranking)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(names[0]).toContain('Ada');
    expect(names[1]).toContain('Bram');
  });

  it("marks the caller's own row", async () => {
    apiMocks.getLeaderboards.mockResolvedValue(boards());
    renderPage();

    const ranking = await screen.findByRole('list', { name: /experience ranking/i });
    const callerRow = within(ranking)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('Bram'));
    // Rendered as "You" and uppercased in CSS, so match the text, not the case.
    expect(callerRow?.textContent).toMatch(/you/i);
    expect(callerRow?.className).toContain('is-caller');
  });

  it('reports a standing to a player who is not on the discovery board', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(boards());
    renderPage();

    expect(
      await screen.findByText(/have not been first to a species yet/i)
    ).toBeInTheDocument();
  });

  it('reports the caller their rank out of the whole field', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(boards());
    renderPage();

    expect(await screen.findByText(/You are #2 of 2 with 65 XP/i)).toBeInTheDocument();
  });

  it('invites the first player in rather than showing an empty table', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(
      boards({
        xp: {
          entries: [],
          caller: {
            rank: null,
            displayName: 'Bram',
            xp: 0,
            wins: 0,
            losses: 0,
            bestWinStreak: 0,
          },
          totalPlayers: 0,
        },
      })
    );
    renderPage();

    expect(await screen.findByText(/No battles fought yet/i)).toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    const user = userEvent.setup();
    apiMocks.getLeaderboards.mockRejectedValueOnce(new Error('offline'));
    renderPage();

    const retry = await screen.findByRole('button', { name: /retry/i });
    apiMocks.getLeaderboards.mockResolvedValue(boards());
    await user.click(retry);

    await waitFor(() => {
      expect(screen.getByRole('list', { name: /experience ranking/i })).toBeInTheDocument();
    });
  });
});
