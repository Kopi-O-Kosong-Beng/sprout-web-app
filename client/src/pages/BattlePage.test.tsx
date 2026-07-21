import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BattlePage from './BattlePage';

describe('BattlePage', () => {
  it('sends a direct visit without an owned avatar back to Archive', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/battle']}>
        <Routes>
          <Route path="/battle" element={<BattlePage />} />
          <Route path="/archive" element={<p>Owned archive destination</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /no plant selected/i })
    ).toBeVisible();
    expect(screen.queryByText('Monstera Scout')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /return to archive/i }));

    expect(screen.getByText('Owned archive destination')).toBeVisible();
  });
});
