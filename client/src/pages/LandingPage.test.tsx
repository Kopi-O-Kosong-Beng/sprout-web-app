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
  spriteUrl: 'data:image/png;base64,sprite',
  stats: { hp: 140, attack: 60, defense: 70, speed: 40 },
  description:
    'A large evergreen tree of lowland forest, long planted along Singapore streets for its fragrant cream flowers and dense crown. '.repeat(
      4
    ),
  commonNames: ['Tembusu'],
  taxonomy: { Family: 'Gentianaceae', Genus: 'Fagraea', Order: 'Gentianales' },
  confidence: 0.94,
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
      await screen.findByAltText('Pixel-art sprite of Fagraea fragrans')
    ).toBeInTheDocument();
    expect(screen.getByText('140')).toBeInTheDocument();
    expect(screen.getByText('Gentianales')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  // Plant.id prose runs to paragraphs; the card takes the opening and marks it.
  it('shortens a long description rather than running the card off the page', async () => {
    apiMocks.getAlmanacEntry.mockResolvedValue(TEMBUSU_DETAIL);
    const user = userEvent.setup();
    renderLanding();

    await user.click(await screen.findByRole('button', { name: /Fagraea fragrans/ }));
    await screen.findByAltText('Pixel-art sprite of Fagraea fragrans');

    const shown = screen.getByText(/A large evergreen tree of lowland forest/);
    expect(shown.textContent!.length).toBeLessThan(
      TEMBUSU_DETAIL.description.length
    );
    expect(shown.textContent!.length).toBeLessThanOrEqual(241);
  });

  it('names the finder once signed in', async () => {
    authMocks.status = 'authenticated';
    apiMocks.getAlmanacEntry.mockResolvedValue({
      ...TEMBUSU_DETAIL,
      discoveredByName: 'NatTheBotanist',
      discoveredAt: '2026-08-01T00:00:00.000Z',
      photoUrl: 'data:image/jpeg;base64,photo',
    });
    const user = userEvent.setup();
    renderLanding();

    await user.click(await screen.findByRole('button', { name: /Fagraea fragrans/ }));

    expect(await screen.findByText('NatTheBotanist')).toBeInTheDocument();
    expect(
      screen.getByAltText('Photograph of Fagraea fragrans by NatTheBotanist')
    ).toBeInTheDocument();
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
