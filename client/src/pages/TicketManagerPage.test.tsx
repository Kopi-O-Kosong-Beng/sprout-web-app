import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TicketManagerPage from './TicketManagerPage';
import type { ManagedTicket } from '../services/sproutApi';

const apiMocks = vi.hoisted(() => ({
  listManagedTickets: vi.fn(),
  setManagedTicketStatus: vi.fn(),
  TICKET_CATEGORIES: [
    { value: 'general', label: 'General' },
    { value: 'partnership', label: 'Partnership' },
    { value: 'technical_support', label: 'Technical Support' },
    { value: 'feedback', label: 'Feedback' },
  ],
}));

vi.mock('../services/sproutApi', () => apiMocks);

function ticket(overrides: Partial<ManagedTicket> = {}): ManagedTicket {
  return {
    id: 'ticket-1',
    refNumber: 'SPR-20260721-0001',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Scan failed on a fern',
    category: 'technical_support',
    message: 'The camera returned nothing.',
    status: 'open',
    submitterEmailStatus: 'sent',
    adminEmailStatus: 'sent',
    createdAt: '2026-07-21T02:00:00.000Z',
    ...overrides,
  };
}

const OPEN = ticket();
const RESOLVED = ticket({
  id: 'ticket-2',
  refNumber: 'SPR-20260720-0004',
  subject: 'Partnership enquiry',
  category: 'partnership',
  status: 'resolved',
});

function cardFor(refNumber: string): HTMLElement {
  return screen.getByText(refNumber).closest('li') as HTMLElement;
}

describe('TicketManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listManagedTickets.mockResolvedValue({
      items: [OPEN, RESOLVED],
      total: 2,
    });
  });

  /* The queue opens filtered to Open. A support inbox that defaults to "all"
   * buries the thing needing attention under everything already dealt with. */
  it('shows open tickets first and counts them', async () => {
    render(<TicketManagerPage />);

    expect(await screen.findByText(/1 open of 2 total/i)).toBeInTheDocument();
    expect(screen.getByText(OPEN.refNumber)).toBeInTheDocument();
    expect(screen.queryByText(RESOLVED.refNumber)).not.toBeInTheDocument();
  });

  it('reveals resolved tickets when the filter changes', async () => {
    const user = userEvent.setup();
    render(<TicketManagerPage />);
    await screen.findByText(OPEN.refNumber);

    await user.click(screen.getByRole('button', { name: 'Resolved' }));

    expect(screen.getByText(RESOLVED.refNumber)).toBeInTheDocument();
    expect(screen.queryByText(OPEN.refNumber)).not.toBeInTheDocument();
  });

  it('shows the reporter and the message body an operator has to answer', async () => {
    render(<TicketManagerPage />);
    await screen.findByText(OPEN.refNumber);
    const card = within(cardFor(OPEN.refNumber));

    expect(card.getByText(OPEN.subject)).toBeInTheDocument();
    expect(card.getByText(OPEN.message)).toBeInTheDocument();
    expect(card.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(card.getByText(/Technical Support/)).toBeInTheDocument();
  });

  /* The row updates from the server's response rather than a refetch: a full
   * reload would drop the operator's scroll position mid-queue. */
  it('marks a ticket resolved and updates the row without reloading', async () => {
    const user = userEvent.setup();
    apiMocks.setManagedTicketStatus.mockResolvedValue({
      ...OPEN,
      status: 'resolved',
    });
    render(<TicketManagerPage />);
    await screen.findByText(OPEN.refNumber);

    await user.click(screen.getByRole('button', { name: /mark resolved/i }));

    await waitFor(() => {
      expect(apiMocks.setManagedTicketStatus).toHaveBeenCalledWith(
        OPEN.id,
        'resolved'
      );
    });
    // It leaves the Open filter, and the count follows it down.
    await waitFor(() => {
      expect(screen.getByText(/0 open of 2 total/i)).toBeInTheDocument();
    });
    expect(apiMocks.listManagedTickets).toHaveBeenCalledTimes(1);
  });

  /* The server's own explanation wins over the generic fallback — a 403 that
   * says "Admin access required." tells the operator their grant was revoked
   * mid-session, which "Could not update that ticket" would hide. */
  it('keeps the row and surfaces the server reason when the update fails', async () => {
    const user = userEvent.setup();
    apiMocks.setManagedTicketStatus.mockRejectedValue(
      new Error('Admin access required.')
    );
    render(<TicketManagerPage />);
    await screen.findByText(OPEN.refNumber);

    await user.click(screen.getByRole('button', { name: /mark resolved/i }));

    expect(await screen.findByText('Admin access required.')).toBeInTheDocument();
    expect(screen.getByText(OPEN.refNumber)).toBeInTheDocument();
    // Still open: a failed write must not leave the row looking done.
    expect(screen.getByRole('button', { name: /mark resolved/i })).toBeInTheDocument();
  });

  it('falls back to its own wording when the failure carries no message', async () => {
    const user = userEvent.setup();
    apiMocks.setManagedTicketStatus.mockRejectedValue({ weird: true });
    render(<TicketManagerPage />);
    await screen.findByText(OPEN.refNumber);

    await user.click(screen.getByRole('button', { name: /mark resolved/i }));

    expect(
      await screen.findByText(/could not update that ticket/i)
    ).toBeInTheDocument();
  });

  it('says the queue is clear rather than showing an empty list', async () => {
    apiMocks.listManagedTickets.mockResolvedValue({ items: [RESOLVED], total: 1 });
    render(<TicketManagerPage />);

    expect(await screen.findByText(/nothing open/i)).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty queue', async () => {
    apiMocks.listManagedTickets.mockRejectedValue(new Error('Admin access required.'));
    render(<TicketManagerPage />);

    expect(await screen.findByText('Admin access required.')).toBeInTheDocument();
    // An operator must not read a failed fetch as "no tickets".
    expect(screen.queryByText(/nothing open/i)).not.toBeInTheDocument();
  });
});
