import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from './ContactPage';

const submitTicket = vi.hoisted(() => vi.fn());

vi.mock('../services/sproutApi', () => ({
  submitTicket,
  TICKET_CATEGORIES: [
    { value: 'general', label: 'General' },
    { value: 'partnership', label: 'Partnership' },
    { value: 'technical_support', label: 'Technical Support' },
    { value: 'feedback', label: 'Feedback' },
  ],
}));

describe('ContactPage notification copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await user.type(screen.getByLabelText(/^subject$/i), 'Account help');
    await user.type(screen.getByLabelText(/^message/i), 'Please help with my account.');
    await user.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(await screen.findByText(
      /Your ticket is stored.*notification delivery to you and the Sprout team has been attempted/i
    )).toBeInTheDocument();
    expect(screen.queryByText(/the Sprout team has been notified/i)).not.toBeInTheDocument();
  });
});

describe('ContactPage UC8 field set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTicket.mockResolvedValue({ refNumber: 'SPR-20260721-0002' });
  });

  it('offers the documented inquiry types', () => {
    render(<ContactPage />);

    const select = screen.getByLabelText(/inquiry type/i);
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    ).toEqual(['General', 'Partnership', 'Technical Support', 'Feedback']);
  });

  it('submits organisation and subject alongside the original fields', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/organisation/i), 'SUTD');
    await user.type(screen.getByLabelText(/^subject$/i), 'Partnership enquiry');
    await user.selectOptions(screen.getByLabelText(/inquiry type/i), 'partnership');
    await user.type(screen.getByLabelText(/^message/i), 'We would like to collaborate.');
    await user.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(submitTicket).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      organisation: 'SUTD',
      subject: 'Partnership enquiry',
      category: 'partnership',
      message: 'We would like to collaborate.',
    });
  });

  it('omits organisation when left blank, since it is optional', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.type(screen.getByLabelText(/^name$/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^subject$/i), 'General question');
    await user.type(screen.getByLabelText(/^message/i), 'Hello.');
    await user.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(submitTicket).toHaveBeenCalledWith(
      expect.objectContaining({ organisation: undefined })
    );
  });
});
