import { useState, type FormEvent } from 'react';
import {
  submitTicket,
  TICKET_CATEGORIES,
  type TicketCategory,
} from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';

const MAX_MESSAGE_LENGTH = 2000;

export default function TicketPanel() {
  const [name, setName] = useState('Test User');
  const [email, setEmail] = useState('test@example.com');
  const [subject, setSubject] = useState('Backend test-page ticket');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [message, setMessage] = useState(
    'Testing the query ticket endpoint from the React test page.'
  );
  const [submitting, setSubmitting] = useState(false);
  const [refNumber, setRefNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setRefNumber(null);
    try {
      const res = await submitTicket({ name, email, subject, category, message });
      setRefNumber(res.refNumber);
    } catch (err) {
      setError(extractApiError(err, 'Request failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Support ticket</h2>
        <span className="endpoint">POST /api/query/submit</span>
      </div>
      <p className="panel-hint">
        Public route — no auth required. Writes a row to the{' '}
        <code>query_tickets</code> collection/table and returns a{' '}
        <code>refNumber</code>.
      </p>

      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Subject
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </label>
        <label>
          Inquiry type
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory)}
          >
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Message ({message.length}/{MAX_MESSAGE_LENGTH})
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            rows={4}
            required
          />
        </label>
        <button
          type="submit"
          className="primary-cta form-submit"
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit ticket'}
        </button>
      </form>

      {error && <div className="result result-err">{error}</div>}
      {refNumber && (
        <div className="result result-ok">
          Created — refNumber: <strong>{refNumber}</strong>
        </div>
      )}
    </section>
  );
}
