import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

const apiMocks = vi.hoisted(() => ({
  getAlmanac: vi.fn(),
  getAlmanacEntry: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({ status: 'unauthenticated' as string }));

vi.mock('../services/sproutApi', () => apiMocks);
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ status: authMocks.status }),
}));

const TEMBUSU = {
  id: 'fagraea-fragrans',
  speciesName: 'Fagraea fragrans',
  commonName: 'Tembusu',
  family: 'Gentianaceae',
  status: 'common' as const,
  origin: 'native',
  growthForm: 'tree',
  discovered: true,
  discoveryCount: 3,
};

const SEA_HOLLY = {
  ...TEMBUSU,
  id: 'acanthus-ilicifolius',
  speciesName: 'Acanthus ilicifolius',
  commonName: 'Sea holly',
  family: 'Acanthaceae',
  discovered: false,
  discoveryCount: 0,
};

const TEMBUSU_DETAIL = {
  ...TEMBUSU,
  spriteUrl: 'https://cdn.test/sprites/fagraea_fragrans/v1.png',
  stats: { hp: 140, attack: 60, defense: 70, speed: 40 },
};

const ALMANAC = {
  source: 'Chong, Tan & Corlett (2009), A Checklist of the Total Vascular Plant Flora',
  total: 200,
  discovered: 1,
  species: [TEMBUSU, SEA_HOLLY],
};

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
  apiMocks.getAlmanac.mockResolvedValue(ALMANAC);
});

describe('landing page almanac', () => {
  it('shows progress and both found and unfound species to a visitor', async () => {
    renderLanding();

    expect(await screen.findByText('Fagraea fragrans')).toBeInTheDocument();
    expect(screen.getByText('Acanthus ilicifolius')).toBeInTheDocument();
    expect(screen.getByText('Found ×3')).toBeInTheDocument();
    expect(screen.getByText('Not yet found')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /species discovered/i })
    ).toHaveAttribute('aria-valuenow', '1');
  });

  // Undiscovered species have nothing behind them, so they are not buttons.
  it('opens only found species', async () => {
    renderLanding();

    expect(
      await screen.findByRole('button', { name: /Fagraea fragrans/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Acanthus ilicifolius/ })
    ).not.toBeInTheDocument();
  });

  it('shows the sprite and stats to a signed-out visitor, and offers a login for the finder', async () => {
    apiMocks.getAlmanacEntry.mockResolvedValue(TEMBUSU_DETAIL);
    const user = userEvent.setup();
    renderLanding();

    await user.click(await screen.findByRole('button', { name: /Fagraea fragrans/ }));

    expect(apiMocks.getAlmanacEntry).toHaveBeenCalledWith('fagraea-fragrans');
    expect(
      await screen.findByAltText('Pixel-art Plantemon of Fagraea fragrans')
    ).toBeInTheDocument();
    expect(screen.getByText('140')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('names the finder once signed in', async () => {
    authMocks.status = 'authenticated';
    apiMocks.getAlmanacEntry.mockResolvedValue({
      ...TEMBUSU_DETAIL,
      discoveredByName: 'NatTheBotanist',
      discoveredAt: '2026-08-01T00:00:00.000Z',
      isFirstDiscoverer: false,
    });
    const user = userEvent.setup();
    renderLanding();

    await user.click(await screen.findByRole('button', { name: /Fagraea fragrans/ }));

    expect(await screen.findByText('NatTheBotanist')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('filters the grid by name, family or common name', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.type(await screen.findByLabelText(/search the almanac/i), 'holly');

    expect(screen.getByText('Acanthus ilicifolius')).toBeInTheDocument();
    expect(screen.queryByText('Fagraea fragrans')).not.toBeInTheDocument();
  });

  // A marketing page must survive its own API being down.
  it('drops the section entirely when the almanac cannot be loaded', async () => {
    apiMocks.getAlmanac.mockRejectedValue(new Error('offline'));
    renderLanding();

    expect(
      await screen.findByRole('heading', { name: /turn the plants around you/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/the almanac/i)).not.toBeInTheDocument();
  });
});

/**
 * The hero and its footnote — the first thing a signed-out visitor reads, and
 * the only place the marketing copy lives.
 */
describe('LandingPage hero', () => {
  it('offers sign up before log in, matching the header order', async () => {
    renderLanding();

    const signUp = await screen.findByRole('link', {
      name: /start scanning \(sign up\)/i,
    });
    const logIn = screen.getByRole('link', { name: /i have an account/i });

    expect(signUp).toHaveAttribute('href', '/signup');
    expect(logIn).toHaveAttribute('href', '/login');
    // Sign up first in the DOM, so it is first for a keyboard and a reader too.
    expect(signUp.compareDocumentPosition(logIn)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  /* Two of these — the hero and the closing call to action. Both must lead to
   * Scan; one still pointing at the archived /home hub would be a dead end. */
  it('sends a signed-in visitor straight to Scan rather than to sign up', async () => {
    authMocks.status = 'authenticated';
    renderLanding();

    const opens = await screen.findAllByRole('link', { name: /open sprout/i });
    expect(opens.length).toBeGreaterThan(0);
    for (const link of opens) expect(link).toHaveAttribute('href', '/scan');
    expect(
      screen.queryByRole('link', { name: /start scanning \(sign up\)/i })
    ).toBeNull();
  });

  /* PVE Battle points at /battle unconditionally: ProtectedRoute carries the
   * path to /login, so signing in lands the visitor on the screen they clicked
   * rather than back here. */
  it('links the footnote to the battle screen and to login', async () => {
    renderLanding();

    expect(await screen.findByRole('link', { name: 'PVE Battle' })).toHaveAttribute(
      'href',
      '/battle'
    );
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login'
    );
  });

  it('describes the plant as a Plantemon, not a sprite or a creature', async () => {
    renderLanding();

    expect(
      await screen.findByText(/into Plantemon that fight/i)
    ).toBeInTheDocument();
    // Hero paragraph and the "Grow" step both use it.
    expect(screen.getAllByText(/pixel-art Plantemon/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/creatures that fight/i)).toBeNull();
  });
});
