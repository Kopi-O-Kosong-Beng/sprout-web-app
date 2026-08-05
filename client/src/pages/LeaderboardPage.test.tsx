import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Leaderboards } from '../services/sproutApi';
import LeaderboardPage from './LeaderboardPage';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';

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

/** Ranking reads without a session now, so the page asks useAuth which of the
 *  two "where do I stand" lines to show. Default to a signed-in player: that is
 *  what every assertion below was written against. */
function authValue(status: AuthContextValue['status']): AuthContextValue {
  return {
    status,
    firebaseUser: null,
    profile: null,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  };
}

function renderPage(status: AuthContextValue['status'] = 'authenticated') {
  return render(
    <MemoryRouter initialEntries={['/leaderboard']}>
      <AuthContext.Provider value={authValue(status)}>
        <Routes>
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/battle" element={<h1>Battle page</h1>} />
        </Routes>
      </AuthContext.Provider>
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

  /*
   * The mount-race that told a ranked player "you are not ranked yet": on a
   * fresh tab the page mounted and fetched before Firebase restored the
   * session, so the request carried no token and the server saw an anonymous
   * caller. The page must hold the fetch until auth settles, then fetch with
   * the session attached.
   */
  it('does not fetch while auth is still restoring, then fetches once it settles', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(boards());
    const view = render(
      <MemoryRouter initialEntries={['/leaderboard']}>
        <AuthContext.Provider value={authValue('loading')}>
          <Routes>
            <Route path="/leaderboard" element={<LeaderboardPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    // While auth is restoring: spinner, and crucially no anonymous request.
    expect(screen.getByText(/Counting the standings/i)).toBeInTheDocument();
    expect(apiMocks.getLeaderboards).not.toHaveBeenCalled();

    view.rerender(
      <MemoryRouter initialEntries={['/leaderboard']}>
        <AuthContext.Provider value={authValue('authenticated')}>
          <Routes>
            <Route path="/leaderboard" element={<LeaderboardPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/You are #2 of 2 with 65 XP/i)).toBeInTheDocument();
    expect(apiMocks.getLeaderboards).toHaveBeenCalledTimes(1);
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

/**
 * Competition ranking gives every player on the same score the same number, so
 * a board where nobody has battled is seven players all called "2nd". Seven
 * identical numerals down the column reads as a bug, so a tied run alternates
 * its fill — and says so to a screen reader, which cannot see the run at all.
 */
describe('players sharing a rank', () => {
  function tiedBoards(): Leaderboards {
    return boards({
      xp: {
        entries: [
          { rank: 1, displayName: 'Ada', xp: 140, wins: 4, losses: 1, bestWinStreak: 3, isCaller: false },
          { rank: 2, displayName: 'Bo', xp: 65, wins: 2, losses: 2, bestWinStreak: 1, isCaller: false },
          { rank: 2, displayName: 'Cy', xp: 65, wins: 2, losses: 2, bestWinStreak: 1, isCaller: false },
          { rank: 2, displayName: 'Di', xp: 65, wins: 2, losses: 2, bestWinStreak: 1, isCaller: false },
        ],
        caller: { rank: 1, displayName: 'Ada', xp: 140, wins: 4, losses: 1, bestWinStreak: 3 },
        totalPlayers: 4,
      },
    });
  }

  /** Scoped to the XP board — the default fixture puts some of the same names
   *  on the discovery board too. */
  function rowFor(name: string): HTMLElement {
    const board = screen.getByRole('list', { name: /experience ranking/i });
    return within(board).getByText(name).closest('li')!;
  }

  it('alternates the fill across a tied run so it does not read as a repeat', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(tiedBoards());
    renderPage();

    // findAll, not find: the default fixture puts some names on both boards.
    await screen.findAllByText('Ada');

    // The run alternates; the untied leader is not part of it.
    expect(rowFor('Ada').className).not.toContain('is-tied');
    expect(rowFor('Bo').className).toContain('is-tied');
    expect(rowFor('Bo').className).not.toContain('is-tied-alt');
    expect(rowFor('Cy').className).toContain('is-tied-alt');
    expect(rowFor('Di').className).not.toContain('is-tied-alt');
  });

  it('tells a screen reader the rank and that it is shared', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(tiedBoards());
    renderPage();

    await screen.findAllByText('Ada');

    // The numeral itself is decorative; this is the only announcement there is.
    expect(within(rowFor('Ada')).getByText('Rank 1.')).toBeInTheDocument();
    expect(
      within(rowFor('Bo')).getByText('Rank 2, tied with 2 other players.')
    ).toBeInTheDocument();
  });

  it('says "player" rather than "players" for a tie of two', async () => {
    apiMocks.getLeaderboards.mockResolvedValue(
      boards({
        xp: {
          entries: [
            { rank: 1, displayName: 'Bo', xp: 65, wins: 2, losses: 2, bestWinStreak: 1, isCaller: false },
            { rank: 1, displayName: 'Cy', xp: 65, wins: 2, losses: 2, bestWinStreak: 1, isCaller: false },
          ],
          caller: { rank: 1, displayName: 'Bo', xp: 65, wins: 2, losses: 2, bestWinStreak: 1 },
          totalPlayers: 2,
        },
      })
    );
    renderPage();

    const board = await screen.findByRole('list', { name: /experience ranking/i });
    expect(
      within(board).getAllByText('Rank 1, tied with 1 other player.')
    ).toHaveLength(2);
  });
});
