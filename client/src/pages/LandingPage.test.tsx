import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

/**
 * The almanac section was removed from this page — the feature stays in the
 * codebase but is not part of the public site for now. These tests hold that
 * removal in place: the page still renders, and it neither shows the grid nor
 * asks the API for it. The suite that covered the section itself went with it;
 * restore it from git history when the section comes back.
 */

const apiMocks = vi.hoisted(() => ({
  getAlmanac: vi.fn(),
  getAlmanacEntry: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({ status: 'unauthenticated' as string }));

vi.mock('../services/sproutApi', () => apiMocks);
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ status: authMocks.status }),
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.status = 'unauthenticated';
});

describe('landing page', () => {
  it('renders the hero for a signed-out visitor', async () => {
    renderLanding();

    expect(
      await screen.findByRole('heading', { name: /turn the plants around you/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start scanning/i })).toBeInTheDocument();
  });

  it('sends a signed-in visitor to the app instead of the sign-up', () => {
    authMocks.status = 'authenticated';
    renderLanding();

    // Both the hero and the closing call to action carry it.
    expect(screen.getAllByRole('link', { name: /open sprout/i })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /start scanning/i })).not.toBeInTheDocument();
  });

  it('shows no almanac section and never fetches one', () => {
    renderLanding();

    expect(screen.queryByText(/the almanac/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/search the almanac/i)).not.toBeInTheDocument();
    expect(apiMocks.getAlmanac).not.toHaveBeenCalled();
  });
});
