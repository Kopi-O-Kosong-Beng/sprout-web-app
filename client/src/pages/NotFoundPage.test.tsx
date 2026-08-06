import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFoundPage from './NotFoundPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/*
 * Every unknown URL used to redirect silently to "/", so a typo, a stale
 * bookmark and a permission-gated route all looked identical to "you asked for
 * the home page" — and the address bar was rewritten, so the original was gone
 * before anyone could read it.
 */
describe('NotFoundPage', () => {
  it('says what was not found instead of silently landing on home', () => {
    renderAt('/nonsense');

    expect(
      screen.getByRole('heading', { name: /this page does not exist/i })
    ).toBeVisible();
    // The path is on screen: a typo is the likeliest cause, and it cannot be
    // spotted in a URL bar the visitor has stopped looking at.
    expect(screen.getByText(/\/nonsense/)).toBeVisible();
    expect(screen.getByRole('link', { name: /back to home/i })).toBeVisible();
  });

  it('offers the section a deep path belongs to, not only home', () => {
    renderAt('/archive/nonsense');

    const toArchive = screen.getByRole('link', { name: /go to archive/i });
    expect(toArchive).toHaveAttribute('href', '/archive');
    // Home is still there, demoted to the secondary choice.
    expect(screen.getByRole('link', { name: /back to home/i })).toBeVisible();
  });

  it('maps the label a visitor actually read in the nav to its real route', () => {
    // "Ranking" is the nav's word for /leaderboard, so /ranking/oops is a
    // plausible hand-typed URL and should still point at the right board.
    renderAt('/ranking/oops');

    expect(screen.getByRole('link', { name: /go to ranking/i })).toHaveAttribute(
      'href',
      '/leaderboard'
    );
  });

  it('offers only home when the path belongs to no section', () => {
    renderAt('/totally/unknown');

    expect(screen.queryByRole('link', { name: /^go to/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toBeVisible();
  });
});
