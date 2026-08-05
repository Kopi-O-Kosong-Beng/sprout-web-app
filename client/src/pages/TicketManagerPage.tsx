import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listManagedTickets,
  setManagedTicketStatus,
  TICKET_CATEGORIES,
  type ManagedTicket,
} from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';

/**
 * Ticket Manager — the superadmin side of the Contact Us form.
 *
 * The public page lets a submitter check one reference number they already
 * hold; this is the other half, where the team reads the queue and marks
 * things done. Open tickets lead, because an inbox sorted newest-first buries
 * the one that has been waiting longest behind a week of resolved ones.
 */

type StatusFilter = 'all' | 'open' | 'resolved';

const CATEGORY_LABELS = new Map(
  TICKET_CATEGORIES.map((entry) => [entry.value as string, entry.label])
);

/** Legacy tickets carry categories the current form no longer offers, so an
 *  unknown value is shown as-is rather than blanked. */
function categoryLabel(value: string): string {
  return CATEGORY_LABELS.get(value) ?? value;
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Unknown date';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleString();
}

export default function TicketManagerPage() {
  const [tickets, setTickets] = useState<ManagedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('open');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await listManagedTickets();
      setTickets(items);
    } catch (err) {
      setError(extractApiError(err, 'Could not load tickets.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleStatus(ticket: ManagedTicket) {
    const next = ticket.status === 'open' ? 'resolved' : 'open';
    setPendingId(ticket.id);
    setError(null);
    try {
      const updated = await setManagedTicketStatus(ticket.id, next);
      setTickets((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
    } catch (err) {
      setError(extractApiError(err, 'Could not update that ticket.'));
    } finally {
      setPendingId(null);
    }
  }

  const openCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'open').length,
    [tickets]
  );

  const visible = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter((t) => t.status === filter)),
    [tickets, filter]
  );

  return (
    <main className="contact-page">
      <section className="page-heading">
        <p className="eyebrow">Team tools</p>
        <h1>Ticket Manager</h1>
        <p>
          {loading
            ? 'Loading the queue…'
            : `${openCount} open of ${tickets.length} total.`}
        </p>
      </section>

      <section className="contact-layout">
        <div className="contact-form">
          <div className="ticket-filters" role="group" aria-label="Filter by status">
            {(['open', 'resolved', 'all'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={
                  filter === value ? 'secondary-cta is-active' : 'secondary-cta'
                }
              >
                {value === 'all' ? 'All' : value === 'open' ? 'Open' : 'Resolved'}
              </button>
            ))}
            <button type="button" className="details-link" onClick={() => void load()}>
              Refresh
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}

          {/* `!error` is load-bearing. A failed fetch also leaves the list
              empty, and "the queue is clear" beside an error message is a lie
              an operator could act on by walking away from a real backlog. */}
          {!loading && !error && visible.length === 0 && (
            <p>
              {filter === 'open'
                ? 'Nothing open. The queue is clear.'
                : 'No tickets match this filter.'}
            </p>
          )}

          <ul className="ticket-list">
            {visible.map((ticket) => (
              <li key={ticket.id} className={`ticket-card is-${ticket.status}`}>
                <div className="ticket-card-head">
                  <p className="eyebrow">{ticket.refNumber}</p>
                  <span className={`ticket-badge is-${ticket.status}`}>
                    {ticket.status === 'open' ? 'Open' : 'Resolved'}
                  </span>
                </div>
                <h2>{ticket.subject || '(no subject)'}</h2>
                <p className="status-meta">
                  {categoryLabel(ticket.category)} · {formatDate(ticket.createdAt)}
                </p>
                <p className="status-meta">
                  {ticket.name} &lt;{ticket.email}&gt;
                  {ticket.organisation ? ` · ${ticket.organisation}` : ''}
                </p>
                <p className="ticket-message">{ticket.message}</p>
                {/* Delivery is reported, never claimed: the ticket is stored
                    either way, and an operator chasing a complaint about "no
                    confirmation email" needs to see which half failed. */}
                {(ticket.submitterEmailStatus === 'failed' ||
                  ticket.adminEmailStatus === 'failed') && (
                  <p className="status-meta">
                    Email delivery failed (submitter: {ticket.submitterEmailStatus},
                    team: {ticket.adminEmailStatus}).
                  </p>
                )}
                <button
                  type="button"
                  className="secondary-cta form-submit"
                  disabled={pendingId === ticket.id}
                  onClick={() => void toggleStatus(ticket)}
                >
                  {pendingId === ticket.id
                    ? 'Saving…'
                    : ticket.status === 'open'
                      ? 'Mark resolved'
                      : 'Reopen'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
