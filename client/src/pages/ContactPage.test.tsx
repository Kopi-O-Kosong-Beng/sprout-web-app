import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from './ContactPage';

const submitTicket = vi.hoisted(() => vi.fn());

vi.mock('../services/sproutApi', () => ({
  submitTicket,
  TICKET_CATEGORIES: ['general', 'bug', 'billing', 'partnership', 'other'],
}));

describe('ContactPage notification copy', () => {
  beforeEach(() => {
    submitTicket.mockResolvedValue({ refNumber: 'SPR-20260721-0001' });
  });

  it('describes ticket storage as complete and email delivery as attempted', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    expect(screen.getByText(
      /Sprout stores a ticket.*then attempts a confirmation email and a team notification/i
    )).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name$/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^message/i), 'Please help with my account.');
    await user.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(await screen.findByText(
      /Your ticket is stored.*notification delivery to you and the Sprout team has been attempted/i
    )).toBeInTheDocument();
    expect(screen.queryByText(/the Sprout team has been notified/i)).not.toBeInTheDocument();
  });
});
