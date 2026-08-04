import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaginatedAvatars } from '../services/sproutApi';
import HomePage from './HomePage';

const apiMocks = vi.hoisted(() => ({
  listOwnedAvatars: vi.fn(),
  setDemoAvatars: vi.fn(),
}));

vi.mock('../services/sproutApi', () => apiMocks);

const emptyPage: PaginatedAvatars = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

function renderHome(initialEntries: string[] = ['/home']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/" element={<h1>Landing page</h1>} />
        <Route path="/archive" element={<h1>Archive page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * The hub renders under GameLayout, which has no AppHeader. Every other game
 * screen's Back button falls through to `/home`, so if the hub itself carries
 * no way out, the whole signed-in half of the app is a navigational trap —
 * no route to `/`, and no route to log out.
 */
describe('HomePage escape routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listOwnedAvatars.mockResolvedValue(emptyPage);
  });

  it('offers a link out to the public site', async () => {
    renderHome();

    const exit = await screen.findByRole('link', { name: /sprout site/i });
    expect(exit).toHaveAttribute('href', '/');
  });

  it('navigates to the landing page from the site link', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(await screen.findByRole('link', { name: /sprout site/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Landing page' })
      ).toBeInTheDocument();
    });
  });

  it('falls back to the public site rather than to itself when there is no history', async () => {
    const user = userEvent.setup();
    // A single entry means nothing to pop; the hub must not target `/home`,
    // which would navigate the page to the page it is already on.
    renderHome(['/home']);

    await user.click(await screen.findByRole('button', { name: /back/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Landing page' })
      ).toBeInTheDocument();
    });
  });

  it('still reaches the in-game destinations', async () => {
    renderHome();

    expect(await screen.findByRole('link', { name: /scan/i })).toHaveAttribute(
      'href',
      '/scan'
    );
    expect(screen.getByRole('link', { name: /archive/i })).toHaveAttribute(
      'href',
      '/archive'
    );
  });
});
