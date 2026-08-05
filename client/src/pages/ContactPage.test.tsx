import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from './ContactPage';

const submitTicket = vi.hoisted(() => vi.fn());
const getTicketStatus = vi.hoisted(() => vi.fn());

vi.mock('../services/sproutApi', () => ({
  submitTicket,
  getTicketStatus,
  TICKET_CATEGORIES: [
    { value: 'general', label: 'General' },
    { value: 'partnership', label: 'Partnership' },
    { value: 'technical_support', label: 'Technical Support' },
    { value: 'feedback', label: 'Feedback' },
  ],
}));

/** Required fields render a leading `*`, so their label text is "* Name"
 *  rather than "Name". Strip the marker before matching, so these queries keep
 *  asserting the field name and not the decoration in front of it. */
function field(name: RegExp) {
  return screen.getByLabelText((text: string) =>
    name.test(text.replace(/^\*\s*/, '').trim())
  );
}

/** The shape axios throws for a 404 carrying a JSON body, which is what
 *  extractApiError unwraps in production. A bare Error would take the
 *  `err.message` branch instead and prove nothing about the real path. */
function apiError(status: number, message: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error: message } },
  });
}

describe('ContactPage notification copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTicket.mockResolvedValue({ refNumber: 'SPR-20260721-0001' });
  });

  /* The three-step "what happens next" list is gone — that column is the
   * status lookup now — but the invariant it protected outlives it: the
   * confirmation email is attempted, never guaranteed, so no copy on this page
   * may tell someone it arrived. */
  it('never claims the confirmation email was delivered', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    expect(screen.queryByText(/email (was )?sent/i)).not.toBeInTheDocument();

    await user.type(field(/^name$/i), 'Ada Lovelace');
    await user.type(field(/^email$/i), 'ada@example.com');
    await user.type(field(/^subject$/i), 'Account help');
    await user.type(field(/^message/i), 'Please help with my account.');
    await user.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(
      await screen.findByText(/Message received!.*reply within 3 working days/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/email (was )?sent/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/the Sprout team has been notified/i)
    ).not.toBeInTheDocument();
  });

  it('offers a status lookup that needs both the reference and the email', async () => {
    const user = userEvent.setup();
    getTicketStatus.mockResolvedValue({
      refNumber: 'SPR-20260721-0001',
      subject: 'Account help',
      category: 'general',
      status: 'open',
      submittedAt: '2026-07-21T02:00:00.000Z',
      resolvedAt: null,
    });
    render(<ContactPage />);

    await user.type(
      field(/^feedback number$/i),
      'SPR-20260721-0001'
    );
    await user.type(field(/^email address$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /^check$/i }));

    expect(getTicketStatus).toHaveBeenCalledWith({
      refNumber: 'SPR-20260721-0001',
      email: 'ada@example.com',
    });
    expect(await screen.findByText(/open — with the team/i)).toBeInTheDocument();
  });

  it('tells the submitter when Sprout replied, once resolved', async () => {
    const user = userEvent.setup();
    getTicketStatus.mockResolvedValue({
      refNumber: 'SPR-20260721-0001',
      subject: 'Account help',
      category: 'general',
      status: 'resolved',
      submittedAt: '2026-07-21T02:00:00.000Z',
      resolvedAt: '2026-07-23T09:30:00.000Z',
    });
    render(<ContactPage />);

    await user.type(
      screen.getByLabelText(/feedback number/i),
      'SPR-20260721-0001'
    );
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /^check$/i }));

    expect(await screen.findByText(/sprout replied on/i)).toBeInTheDocument();
  });

  /* Resolved before resolvedAt was tracked. Reporting the state without a date
   * is correct; inventing one would tell someone Sprout replied at a time
   * nobody recorded. */
  it('reports a resolved ticket with no recorded date without claiming one', async () => {
    const user = userEvent.setup();
    getTicketStatus.mockResolvedValue({
      refNumber: 'SPR-20260712-0002',
      subject: 'Legacy ticket',
      category: 'general',
      status: 'resolved',
      submittedAt: '2026-07-12T02:00:00.000Z',
      resolvedAt: null,
    });
    render(<ContactPage />);

    await user.type(
      screen.getByLabelText(/feedback number/i),
      'SPR-20260712-0002'
    );
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /^check$/i }));

    expect(await screen.findByText('Resolved')).toBeInTheDocument();
    expect(screen.queryByText(/sprout replied on/i)).not.toBeInTheDocument();
  });

  it('surfaces the server message when the reference and email do not match', async () => {
    const user = userEvent.setup();
    getTicketStatus.mockRejectedValue(
      apiError(404, 'No ticket matches that reference number and email address.')
    );
    render(<ContactPage />);

    await user.type(field(/^feedback number$/i), 'SPR-20260721-9999');
    await user.type(field(/^email address$/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /^check$/i }));

    // One message for "no such ticket" and "not your ticket" — the form must
    // not become an oracle for which reference numbers exist.
    expect(
      await screen.findByText(/no ticket matches that reference number/i)
    ).toBeInTheDocument();
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

    await user.type(field(/^name$/i), 'Ada Lovelace');
    await user.type(field(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/organisation/i), 'SUTD');
    await user.type(field(/^subject$/i), 'Partnership enquiry');
    await user.selectOptions(screen.getByLabelText(/inquiry type/i), 'partnership');
    await user.type(field(/^message/i), 'We would like to collaborate.');
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

    await user.type(field(/^name$/i), 'Ada Lovelace');
    await user.type(field(/^email$/i), 'ada@example.com');
    await user.type(field(/^subject$/i), 'General question');
    await user.type(field(/^message/i), 'Hello.');
    await user.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(submitTicket).toHaveBeenCalledWith(
      expect.objectContaining({ organisation: undefined })
    );
  });
});
